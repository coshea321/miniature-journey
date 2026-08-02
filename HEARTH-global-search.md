# Hearth — Global search: design record & build brief

**Status: DESIGN CONFIRMED 02/08/2026. Build NOT started.**
Design session: Opus. Cathal's four decisions were made via AskUserQuestion and are **binding** — a build session should not re-litigate them or widen the scope.

This file exists so a fresh session can build the feature from the notes alone. It is referenced from the "Global search" entry in `HEARTH-notes.md` § Pending. If the two ever disagree, **this file is the detail and the notes entry is the summary** — fix the notes to match.

---

## 1. What it is

A **finder**, not a filter.

Global search never renders records itself. It finds them and hands off to the section that owns them. That single principle keeps the feature additive and safe:

- no new store
- no sync changes
- nothing added to export / backup
- nothing scheduled, nothing that runs on its own

If a proposed addition breaks one of those four, it is out of scope for v1.

---

## 2. Cathal's confirmed decisions (binding)

### ① Scope = Lists ONLY

All four list types — **Grocery, General, Personal, Travel** — **plus Notes**. Item names **and** their notes text.

**Explicitly out of v1:** Recipes, Trips, Plants, Baby, Medicine, Track logs.

> Flagged to Cathal at design time and accepted by him: Lists-only means global search **will not find a recipe**, which is arguably the most common "where did I put that" case. **Recipes is the obvious phase 2.** It is not in scope now — do not add it without asking.

Deliberately excluded on judgement, worth re-raising only if Cathal asks: Baby health and Medicine logs. They are time-ordered records you browse by date, not things you search by name, and surfacing a dose next to a grocery item is a jarring category mix.

### ② Matching = substring first, fuzzy fallback

- **Primary:** plain case-insensitive `indexOf`.
- **Fallback:** only when substring returns **zero** results, fall back to the existing `fuzzyMatch`, under a clear heading — *"No exact matches — showing similar"*.
- **Minimum query length: 2 characters** before searching at all.

**Do NOT use `fuzzyMatch` as the primary matcher.** This is not a preference, it is the lesson of v383 (see §5). `fuzzyMatch` is a *subsequence* matcher: `"curry"` matches any text containing c…u…r…r…y in order, including "slow cooker … crusty bread, very yummy". At app scale that returns most of the data and reads to the user as "search did nothing".

### ③ Entry point = a 🔍 search row on Home

Near the top of Home. Costs no bottom-nav slot (the bar is already crowded with opt-in icons) and Home is where Cathal lands anyway — the same precedent as the permanent Plants card being the door into a section with no nav icon.

**Not** a sixth nav icon. **Not** a magnifier in every section header.

### ④ Results shape

- Grouped **by list type**, each group a header plus up to ~5 results.
- Empty groups omitted entirely.
- `"+N more →"` per group, which jumps to that list **with its own search pre-filled** — global search hands off to the local search.
- Tapping a result navigates to the record's list.

---

## 3. Non-negotiables carried from the v381→v383 saga

These are not style preferences. Each one is a bug that actually shipped.

1. **Empty states must say WHY.** Never a bare "Nothing here yet." Say `No matches for "banana"` — name the query. An unexplained empty state is what made recipe search read as broken across three consecutive versions.
2. **Never silently combine with a section's own filter state.** When global search hands off to a list, it must **reset that list's filters**. v381 existed solely because search silently AND-ed itself with the Favourites filter.
3. **Guard every record.** Assume the data contains malformed entries — sync merges and CSV import both produce them. A `null` in a store must degrade, never throw. (There is a live example of this exact crash: see §6.)
4. **Test against realistic data, not seed data.** The v383 bug was invisible on the 1-recipe seed book and invisible on githack (test mode = sandboxed storage + seed data). It only appeared on a real-sized store. Any test for global search must use a realistic multi-record fixture.

---

## 4. Build this FIRST — the structural prerequisite

**There is no reusable "open this record" helper anywhere in the app.** The Today card, the famlog card and the trips card each hand-roll the same 3–4 lines of set-state + `switchSection()` + render. Global search would be the **fourth** copy.

**Factor one `openRecord(type, id)` helper, convert the existing callers to it, then have global search call it.**

The per-domain steps genuinely differ — this is why copy-paste keeps going wrong:

| Target | State to set | Extra steps that are easy to miss |
|---|---|---|
| **Lists** | `currentList` | `applyListTheme()` **and** `switchTab("list")`, then `renderList()` |
| **Notes** | — | `switchSection("notes")` is a valid legacy shortcut; `switchSection` itself maps it to `currentList = "notes"` + the Lists section |
| **Recipes** | `_recipeView`, `_recipeOpenId` | `renderRecipeDetail()` guards a stale id and falls back to the list |
| **Trips** | `_tripView`, `_tripOpenId` | the same block appears **twice** (~`:12214` and `:12216`) — check both when editing |
| **Plants** | `_plantView`, `_plantOpenId` | **must also clear `_plantImporting`, `_plantImportParsed` and `_plantArea`** or the deep link loses to a half-finished import or a hidden area filter |
| **Baby** | `currentBabyView` | sub-tabs are `growth`/`medicine`/`milestones`/`teeth`/`bags`; no caller currently sets this before `switchSection("baby")` |

Line numbers are from v383 and will drift — grep, don't trust them.

**Important limitation for v1 scope:** there is **no id-level deep link to a single list item anywhere in the app** — only list-type selection. So global search v1 lands the user on the **right list**, not on the individual item. Jumping to the item itself is a further piece of design, and needs Cathal's call before anyone builds it.

Naming note: the two existing `open*` functions — `openRecipeEditor(id)`, `openPlantEditor(id)` — open **editors**, not detail views. Don't follow their pattern; they are a different thing.

---

## 5. Why the matching rule is the way it is

Measured on a 12-recipe book with `fuzzyMatch` as the primary matcher (i.e. the pre-v383 behaviour):

| Typed | Recipes returned |
|---|---|
| `curry` | 7 of 12 |
| `pie` | 5 of 12 |
| `stew` | 4 of 12 |

Cathal's report of this was **"nothing changed at all"** — the list was filtering, it was just returning so much of the book that it looked untouched. The failure mode of a too-loose matcher is *indistinguishable from a broken search*, and it cost three versions to diagnose.

Global search runs over far more records than one recipe section. Substring-primary is not optional.

---

## 6. Known live bug that will bite this feature

**A `null` entry in `fl4_recipebook` crashes the entire Recipes section.** `renderRecipes()`'s category-collection loop does `rb.forEach(function(r){ var c = (r.category||"").trim(); ... })` with no null guard, so one bad record kills the section rather than skipping it.

Repro: `storeSet("fl4_recipebook", [goodRecipe, null])` → `TypeError: Cannot read properties of null (reading 'category')`.

Not yet fixed; tracked in `HEARTH-notes.md` § Pending. It is the same unguarded-lookup class `CLAUDE.md` warns about. **Any global-search code that iterates a store must assume this class of data exists.** (`recipeSearchText()`, added in v383, is already `!r`-guarded — copy that posture.)

---

## 7. Implementation sketch

No index, no new store. Scan the stores live on each keystroke — the data is already in memory and localStorage-bounded, so a few thousand records is nothing. Debounce ~120 ms.

Rough shape:

```
globalSearch(query)
  -> if query.length < 2: return empty
  -> for each list type in [grocery, general, personal, travel, notes]:
       haystack per item = name + " " + notes, lowercased once
       substring pass; if the WHOLE search found nothing, second fuzzy pass
  -> group results by list type, cap ~5 each, drop empty groups
  -> render: header per group, "+N more →" where capped
  -> tap  -> openRecord("list", …) with that list's filters reset
```

Build a `listSearchText(item)` helper mirroring v383's `recipeSearchText(r)` — top-level, `!item`-guarded, lowercased once.

**`CLAUDE.md` quirk that applies here:** helpers called from renderers must be **top-level**, never locally scoped. This has broken this file before.

### Explicitly not in v1
- No search history (churn + storage).
- No ranking beyond "match in name beats match in notes".
- No cross-section results (that is the scope decision, §2①).
- No id-level jump to an individual list item (§4).

---

## 8. Model guidance

The **design** is done and is in this file. The **build** is mechanical: one search row, one `globalSearch()` over five stores, one grouped results renderer, plus the `openRecord()` refactor.

That is a **plain-Sonnet job** from this document. It does not touch sync, dosing, trip import/export or the service worker, so the standing model-check rule does not fire.

Two things that would need a stronger model or a fresh design call with Cathal:
- adding **Recipes** (phase 2) — a scope decision, his call, not a build decision
- **id-level deep links to individual list items** — genuinely new design (§4)

---

## 9. Open questions for Cathal (none blocking the v1 build)

1. **Phase 2 — add Recipes?** Flagged and deferred at design time. His call.
2. **Item-level jump?** v1 lands on the list; going to the exact item needs new deep-link design.
3. **Does the Home search row stay visible, or collapse behind a 🔍 tap** like the existing per-section searches? Follow the existing pattern unless he says otherwise.
