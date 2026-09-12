# Hearth — UI/UX review (12/09/2026)

**Status: suggestions, nothing confirmed.** Do not build from this file until Cathal picks items. A pick belongs in `HEARTH-backlog.md` as a normal pending entry, then its own version/PR.

Reviewed **v468** on a phone-width column (~480px), walking Home, Lists, Recipes, Baby → Medicine, More, Settings, Watchlist and Track → Food. This is not a council pass and not a sync/dosing audit.

**Already-good, do not undo:** the five-icon bar + More sheet (v452); Today-card lines that hide when they have nothing to say; Calpol/Nurofen chips that fill a weight-based dose; Focus mode on recipes; the colour-per-section headers; grocery checkbox vs notes tap zones (v257); hist-add 40px / hist-del 32px (v415).

**Already rejected, do not re-open:** dark mode, shopping mode, dashboard customisation, CSS extraction, desktop cosmetics, growing both History buttons, a Watchlist line on Home, a warranty nudge, Family Log on Home, nav-consolidation stages 2–4.

**Already in flight:** [PR #229](https://github.com/coshea321/miniature-journey/pull/229) (*v467: Polish mobile sheets and filtered empty states*) already does four things this review would otherwise ask for: drop the doubled section titles, keep sheets above the keyboard, fade overflowing chip rows, and make filtered empties name the query. **Do not merge it as-is** — it still numbers itself v467, and `main` has since shipped a different v467 and v468. If those four still sound right, rebase it onto current `main` as **v469**. If not, close it.

---

## What's working

The app already has a clear personality: cream page, Georgia titles, one accent per section, big primary buttons. Empty days read as calm rather than broken. Medicine logging is a short form with large chips, which is the right shape for 2am. Track → Food is the densest screen and still holds together.

The problems below are mostly *too many peers on one row* and *the same fact painted twice*, not missing features.

---

## Pick these (ranked)

Each item is one version if you want it. Options are listed so a later session does not invent a third shape.

### 1. Home on a quiet day is a stack of empty doors

On a day with nothing due, Home still shows: search, weather, “All caught up”, Training, Last medicine, Plants, four quick-add chips, empty ★ Today, empty Grocery, empty week strip.

The Today card already self-suppresses. The glance cards and spotlights below it do not, so a quiet day is longer than a busy one.

**Suggested default (Option A):** hide Training / Last medicine when they have nothing to show; hide ★ Today and Grocery spotlights when those lists are empty; hide the week strip when no session landed this week. **Keep Plants** — that card is the door into a section with no nav slot (v379, on record). Keep the four quick-add chips.

**Option B:** leave every card, put everything below quick-add behind a “Show the rest” tap.

**Option C:** leave Home as it is.

Do **not** add a rearrange-the-cards editor. Dashboard customisation was rejected.

### 2. Baby → Medicine: bottle tracking sits on top of Log

The 2am screen currently leads with “Bottle freshness” (Mark opened ×2, add another bottle) and only then “Log medicine”. The Calpol / Nurofen / Antibiotic chips and the Log button are the actual job. Bottle tracking is useful and should stay — just not in the first slot.

**Suggested default:** swap the two cards so Log medicine is first. Leave tab order as Growth → Medicine → … (reordering tabs is a habit change for Petra). Optional extra, only if you ask: remember the last Baby tab for this device.

The chips **already** fill a weight-based dose when tapped. An empty Dose box is not a missing calculator — it is waiting for a chip tap. A one-line hint under the chips (“Tap Calpol or Nurofen for a weight-based estimate — then check the leaflet”) would make that obvious without touching formulas, rounding, or the 10ml cap.

### 3. Recipes: five tool chips pretend to be filters

The list opens with Week plan / Tidy / Prep helper / Calories / Select, all the same pill shape as the All / Favourites / category chips underneath. Week plan is a place you go. The other four are occasional maintenance.

**Suggested default:** keep **Week plan** as a real button (it is the third recipe view). Put Tidy, Prep helper, Calories and Select behind one **Tools** sheet. Category chips stay on the list.

On a recipe itself, the Focus hint is 11px grey and describes *classic ticks* (“Tap a line as you go and it greys out”) while sitting next to the Focus button, whose on-state does the opposite.

**Suggested default:** hide that sentence until Focus is on, and when it is on use the existing on-state copy only.

### 4. Settings is still titled as a category manager

The sheet opens with “Manage your custom categories”, then an empty category list, then the Visible sections toggles (the thing you actually came for), then backup, then delete-all. The close control is 30px.

**Suggested default:** retitle to Settings. Put **Visible sections** first, with one short line (“Five on the bar, the rest under More”). Fold custom categories behind a tap. Keep Import / Export as the next block. Keep Delete all at the bottom, unchanged (already behind a confirm).

Do **not** add Settings tabs, and do **not** silently restore `secVisible` / `syncPrefs` from a backup as part of this — that is audit F4 and needs its own call.

---

## Smaller, if you want a polish version

These are cheap and do not change how the app thinks. Several overlap PR #229 — skip any that land there.

| Item | Why |
|---|---|
| **Log-medicine hint** under the chips (see §2) | Stops the empty Dose box looking like you must know the ml |
| **Trip Import** is icon-only; Plants Import already has `aria-label` | Same pattern, one missing label |
| **Notes format toolbar** uses `title` only, no `aria-label` | Screen readers get nothing; titles also fight the Android selection popup |
| **List ★ today star** has `title`, no `aria-label` | Same gap |
| **`.modal-close` 30px → 44px** on Settings / More / Sync | The X is the one control you use to leave those sheets |
| **Dose working text** `#7A5A7A` at 13px | Safety copy should not be the palest text on the card. Wording stays exactly as it is |
| **Watchlist in global search** | Already specced in `HEARTH-watchlist-design-notes.md` item 4; still not built |
| **Season +1 on an expanded watching row** | Same design notes, item 2 |

Filtered empty states that *name the query* are the 02/07 parked polish item, and PR #229 already writes them. Prefer rebasing that PR over rewriting them here.

---

## Looked at, not recommending

- **Lists’ five tabs** (Grocery / General / Personal / Travel / Notes) fit on a 480px bar. Cramped, but readable. Nav-consolidation stages 2–4 stay closed.
- **Track → Food** is busy and fine. Do not promote “Save as meal”.
- **More sheet** copy is already plain. No change.
- **A sixth nav icon, or search on every header** — global search lives on Home on purpose (`HEARTH-global-search.md`).
- **Projects** is already the confirmed next *feature* version and will take DIY out of Lists → General. Do not redesign Lists around that in the meantime.

---

## Questions for Cathal (only he can answer)

1. On a quiet day, should Home hide the empty Training / medicine / Today / Grocery / week blocks (**§1 Option A**), or do you use those empty cards as doors?
2. May Log medicine move above Bottle freshness? (Tab order stays the same.)
3. Recipes: Week plan stays visible, other tools behind **Tools** — yes/no?
4. Settings regrouping in §4 — yes/no?
5. PR #229: rebase as v469, or close it?

Nothing in this file is a build brief until those answers are written into `HEARTH-backlog.md`.
