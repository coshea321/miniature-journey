# Hearth — minimal-UI review (28/09/2026)

**Status (29/09/2026):** Cathal asked to keep this review and build quick wins 1–6 as one version. **Those shipped as v487; issue 1 (Home repeats itself) shipped as v488.** Later versions (v489–v494) are tracked in the backlog entry. Everything else below is *offered, not confirmed* — the open items are listed in `HEARTH-backlog.md` § UI/UX review (28/09/2026). A build session needs a design confirm on any of them first. Issue 5 touches the Baby medicine flow, so it needs a top-tier session (CLAUDE.md model gate).

Reviewed **v486**, test build with demo data, 390px phone viewport, every section. Contrast and tap sizes were measured with a script. Lens: "what remains after everything unnecessary is removed", judged on daily use by one person on a phone.

**Not re-opened (already decided):** hiding the Training / Last medicine / Plants cards, the Option A Home hides, dark mode, shopping mode, dashboard customisation, nav-consolidation stages 2–4 (see the 12/09 review, `HEARTH-ui-ux-review.md`).

---

## Verdict
Hearth is fast at its core jobs and more consistent than most single-file apps: one colour per section, the same list-then-detail pattern everywhere, and a real add bar on Lists. The friction now is saying things twice. Home repeats itself, pale text is used everywhere, and on some screens the headers and tab rows take about 220px before any content. Most of the fixes are removals.

## Top 5 issues (ranked by daily impact)

### 1. Home says the same thing two or three times
Groceries appear three times: the "7 groceries to buy" line, the `+ Grocery` button and the Grocery list preview. The watering reminder appears twice (Today line and Plants card), and so does today's medicine (Today line and Last medicine card). The header takes four lines: greeting, date, local clock, and "Home (Ireland)".
**Fix:** in `renderTodayCard()` (~18766), drop the grocery line when the Grocery preview is showing, and drop the medicine and watering lines because their cards already say it. **The cards stay**, as Cathal decided on 13/09. Remove the local clock (the phone's status bar shows the time) and keep the "Home (Ireland)" line, which only shows when abroad.

### 2. Low contrast and too many font sizes
Measured contrast (WCAG AA needs 4.5:1 for small text):

| Text | Size | Colour | Contrast |
|---|---|---|---|
| Inactive nav labels | 10px | `#AAA090` | 2.58:1 |
| Home card labels (TRAINING / LAST MEDICINE / PLANTS / CALORIES) | 11px | tints | 2.3–2.9:1 |
| Section sub-tabs, inactive | 13px | `rgba(255,255,255,.65)` | about 3.2–3.8:1 |
| Baby centile disclaimer | 10px | `#B8A8B8` | 1.95:1 (fixed in v487) |

`index.html` uses 20 different font sizes, including 152 uses of 11px and 39 of 10px.
**Fix:** keep four sizes (11, 13, 15 and 20px), nothing below 11px, and darken all tint text to at least 4.5:1. Suggested values:
- nav: `.bn-btn{color:#736856}` (5.5:1)
- glance labels: blue `#4F6FA8`, purple `#7A4F9A`, green `#4E7040`, amber `#8A6630`
- inactive sub-tabs: `rgba(255,255,255,.85)`

### 3. The main add button is top right, under a second header bar
On Trips, Watchlist, Health and Recipes there is a 64px header, then a coloured action bar with `+ New` / `+ Add` on the right, then tabs. Track also adds a full-width "Recording for" row. That is up to about 220px of chrome on an 844px screen, and the most-used button sits in the hardest place to reach with a thumb.
**Fix (by subtracting):** fold the action bar into the header row, with the title on the left and actions on the right, so each section loses one bar. To make room, move the rare buttons (Import, 📥, 🎲) into the section's tools menu. Show "Recording for" only where it matters, or as a small chip in the header.

### 4. The same things have different names in different places
- **Names:** Home `+ Task` opens "Add to To-do", which saves to the **General** tab. Nav "Health" opens "Medical history". "Watch" opens "Watchlist". "Inventory" is also called "Home inventory" and "Appliances".
- **Buttons:** `+ New`, `+ New trip`, `+ Add`, `Log`, `Add` and `Save measurement`.
- **Dates:** Baby growth `2026-09-25`; Baby medicine `28 Sept 07:30`; Track `SUNDAY, 27 SEPTEMBER`; Health `19/09/2020`; Trips `5–9 Oct`.

**Fix:** one name per thing, used everywhere. Use one verb for creating a record (`+ New`) and one for logging (`Log`). Send every list date through one helper: `28 Sep` this year, `28 Sep 2025` otherwise, and the time only where it matters.

### 5. Home's `+ Medicine` is a second, thinner medicine form
`doHqpAdd()` (~19216) writes a Baby medicine entry from free text only. It has no dose, no Calpol/Nurofen buttons, no timing advisory, and nothing says it is for the baby. Separately, `+ Grocery` / `+ Task` close after one item, so adding five groceries from Home takes 15 taps.
**Fix:** make `+ Medicine` jump straight to Baby → Medicine, which removes the second form. For grocery and task, keep the panel open after adding: clear the field and put the cursor back, and close only on ✕. ⚠️ The medicine change is dosing-adjacent: it needs a design confirm and a top-tier session.

## Quick wins (1–6 shipped v487)
1. ✅ **Sync status:** the old code set `btn.style.color` on the 🔁 emoji, and CSS colour doesn't tint emoji, so the green never showed. It is now a dot on the button: green = signed in and online, amber = offline or logged out. (Moving sync into Settings was the other option; not taken.)
2. ✅ **Zoom:** `user-scalable=no` removed from the viewport.
3. ✅ **Reduced motion:** a `prefers-reduced-motion` rule turns animations and transitions off.
4. ✅ **Lists category pill:** items under a category header show the emoji only (32×32, still opens the category picker; the name stays for screen readers).
5. ✅ **Home "See all →":** grown from 60×18px to about 72×38px.
6. ✅ **Labels and disclaimer:** `homeSearchInput` gets `aria-label`; the Baby centile disclaimer is now 12px `#8A6A8A` (4.66:1), wording unchanged.

## What to remove (offered, not confirmed)
- The local clock on Home.
- Today-card lines that repeat a card or the Grocery preview (issue 1).
- Watchlist's second filter row (All / Watching / To watch / Watched). The list is already grouped by exactly those.
- `Print` and `Import list` from the tool row under the Lists add bar; put them behind one "⋯" button.
- The section action bar as a separate strip (issue 3).
- The always-on full-width "Recording for" row on Track.

## What's working (keep)
- The Lists add bar (mic, suggestions, Recent). It is the fastest input in the app.
- Today-card lines that hide when empty, and calm empty states.
- Baby → Medicine: the log form first, big Calpol/Nurofen buttons, "last logged" advisories, "check the leaflet".
- The five-icon bar plus More, and one colour per section.
- A confirm on every delete (slower, but safe with two phones syncing).
- Track → Food: dense but coherent.

## Score (at v486)
- **Simplicity 6/10:** the parts are simple, but Home and the stacked headers repeat themselves.
- **Clarity 7/10:** the main action is usually obvious; names and date formats drift between modules.
- **Polish 6/10:** a consistent look, let down by 20 font sizes and widespread small text below AA contrast.
