# Watchlist — design-improvement notes (live, 02/09/2026)

Working notes from a design-review session on the 🍿 Watchlist (v391 core, v392 Watching + season, v451 status filter + 🎲). **Nothing here is built.** Each item is written so a plain-Sonnet build session could do it from this file plus the backlog. Cathal picks; the rest stay here or get folded into `HEARTH-backlog.md` § Watchlist follow-ups.

Status of this file: **complete** (session finished; see bottom).

## What's already good (don't undo)
- Three-state stored as two booleans (v391-phone safety) — every suggestion below keeps that.
- Title-derived search links, nothing stored/fetched — keep; no posters, no API.
- Watching first, To watch, then collapsed Watched — right order.
- Chips only render when there is a real choice (v379 rule).

## Suggestions, ranked by value ÷ cost

### 1. Show the watched date on watched rows (backlog item ④) — small, cheap
`watchedAt` is already stored and only drives the sort. In `watchRowHTML`, when `status === "watched"` and `watchedAt > 0`, add a muted `Watched 14 Aug` line (day + short month; add the year only if it isn't this year) next to or under the stars. Reuse whatever short-date helper Plants uses for "watered 3d ago" rather than adding a new formatter.
- Why: the Watched group is currently a pile with no time sense; "when did we watch that" is the only question it can't answer.
- Cost: ~6 lines, one test assertion in `tests/cases/30-watchlist.js` (row shows the date; a todo row doesn't).

### 2. Season chip should be tappable: "+1" next season — small
The season field lives behind Edit → number box → Save. A TV show in the **Watching** group is the one place it changes often. In the **expanded** row only, render the Season chip as `Season 3  [ + ]`, where the `+` bumps `season` by one (clamped at 99, via `watchSeasonOf`), stamps `updated`, saves, re-renders. No decrement button (a mis-tap on `+` is fixed in the editor; a `−` doubles the target count for a rarer action).
- Only for `kind === "tv"` and only in the expanded row, so the collapsed list stays quiet.
- Cost: one new top-level `watchBumpSeason(id)` mirroring `watchSetRating`'s −1 guard; ~15 lines; 2 assertions (bumps, clamps at 99).

### 3. The tick cycle is the one thing likely to bite — reconsider the third step
`WATCH_CYCLE`: ○ → ▶ → ✓ → **○**. Tapping the tick on a watched row (likely by accident when scrolling the open Watched group) silently moves it back to To watch **and clears `watchedAt`**; the rating survives, the date doesn't. Options, cheapest first:
- **(a)** Make the third tap a no-op on watched rows (cycle stops at ✓; the explicit status picker in the expanded row is the way back). One-line change to `WATCH_CYCLE` + `watchCycleStatus`; one test assertion changes (declare in PR body).
- **(b)** Keep the cycle but keep `watchedAt` when leaving watched, same as the rating — then a mis-tap and re-tap loses nothing. Changes the sort of the Watched group only if the date is reset on re-watch. Cheapest fix that keeps the v392 behaviour.
- Recommend **(b)**; it's the same "never destroy something he typed" rule applied to a timestamp. Note in the PR that `tests/cases/30-watchlist.js` pins "watchedAt cleared on leaving watched" — that assertion flips deliberately.

### 4. Global search group (backlog item ③) — small, mechanical
`GLOBAL_SEARCH_GROUPS` entry `{ key:"watchlist", label:"🍿 Watchlist", color:"#4A3F7A" }` (WATCH_COLOR) + a `globalSearchPool` branch mapping `title` → name, `note` → notes, exactly the v387 Recipes shape; result tap = `switchSection("watch")` + `_watchOpenId = id` + reset both filters to All (the 🎲 already does that trio — factor its tail into `watchRevealRow(id)` and call it from both, rather than a second copy).
- Value rises the moment the list passes ~30 entries or the nav icon is turned off.

### 5. Random pick: let it respect the kind filter — tiny
`watchRandomPick` resets both filters to All. On a Friday night "pick a film" is the actual ask; if the Films chip is on, the pick should come from films. Keep the status reset (watched must still be excluded, todo + watching still both count), drop the kind reset: filter candidates by `_watchFilter` first and leave `_watchFilter` alone. Toast becomes "🎲 Tonight's film: …" / "…show: …" via `watchKindMeta`.
- Cost: 3 lines. The v451 comment about "always the one row visible" still holds because the pick is inside the visible kind.

### 6. "Who wants to watch it" (backlog item ①) — medium; only if asked
Offered in v391, not picked. If it comes back: **one free-text-with-datalist field `who`**, exactly the Health `person` pattern (never an enum), rendered as a tiny chip on the row and a third chip row that appears only when ≥2 names are on record. Don't build without a fresh ask; backlog says don't volunteer it.

### 7. Housekeeping the "Watched" group — small, later
When Watched passes ~50 rows it becomes the longest thing on the screen even collapsed-by-count. Two cheap reliefs, either/both:
- Sort control on the forced-open Watched view: by date watched (current) vs by rating. A single toggle button in the group header, session-only.
- Show the ★ stars on collapsed watched rows only when `rating > 0` (already the case) — fine; no change.

### 8. Editor polish — tiny, cosmetic
- The Note placeholder still says "what season you're on…" (v391 wording) although the season now has its own field (v392). Trim to "Where it is, who picked it…".
- `wEdTitle` could take `autocapitalize="words"`; titles are proper nouns.
- Title input: add `enterkeyhint="done"` and save on Enter — same as the list add box.

### Not recommended (and why)
- **Posters / artwork** — images are the one thing that threatens the localStorage budget (v377 constraint) and would need an API. Stays out.
- **Episode tracking** — Cathal: "episode not needed" (v392). Stays out without a fresh request.
- **Home/Today line** — the section has a permanent nav slot; backlog ② says only revisit if the nav icon is turned off.
- **A fourth status ("dropped / gave up")** — would need a third boolean to stay v391-safe, and "remove" already covers it. If wanted later, `abandoned` as a third boolean that `watchStatusOf` reads after `watched`, never a status string.
- **Making the JustWatch link a deep link** — needs an id resolver = an API. Stays a search URL.

## Suggested first PR (if he says "do the cheap ones")
Items **1, 3(b), 5, 8** together as one version: all UI/local-write only, no sync, export or store change, one test file touched (`30-watchlist.js`: +3 assertions, 1 flipped for 3b — declare in PR body). Under 200 words of spec, so no design-here/build-there split needed per CLAUDE.md.

Second PR: **2 + 4** (season bump, global search).

## Colour scheme (Cathal's follow-up question, 02/09, with a screenshot of the live list)
Problem seen: one purple everywhere; state is only a 19px glyph, kind is only a same-size emoji, and the two chip rows look identical. Four hues total, no more: purple = section brand, green = done, teal = TV, amber = Film.
- **State on the card, not just the icon.** Left edge stripe (4px) + faint tint: Watching = purple stripe, pale lavender bg (#F4F1FA); To watch = no stripe, white (the bulk of the list stays quiet); Watched = green stripe (#3E8E5A), light grey bg (#F5F4F7), title opacity .6 as now. Darken the To-watch circle from #BEB6D0 to ~#9A92B8 (currently near-invisible on white).
- **Kind as a text pill, not an emoji.** Replace the row emoji with a small uppercase pill: `TV` teal (#2F6E6E on #E4F0F0), `FILM` amber (#B5651D on #FBEEDF). Emojis render differently per phone and both read as the same dark blob at 15px. Keep the emoji in the filter chips only.
- **Chip rows.** Selected chip takes the colour of what it selects: Films amber, TV teal, Watching purple, Watched green, To watch dark grey; unselected stays white/#DCD6EA. Both "All" chips stay purple. Then the two rows are distinguishable without reading them.
- **Group headers** take the same state colours as the stripes (Watching purple already; To watch dark grey; Watched green) instead of all-grey.
- **Double header**: green app bar "🍿 Watchlist" + purple section bar "🍿 Watchlist" repeat each other; ~60px of phone screen. Worth dropping the section bar's title (keep 🎲 and + Add) or folding those two buttons into the app bar, like Plants/other sections if they do it.
- Build cost: all inside `watchRowHTML`, `renderWatchlist` chip loops, `WATCH_STATUS_UI`/`WATCH_KINDS` (add a `color`/`bg` per kind). No data change. Could ship with the first PR above.

## Session log
- 02/09 start: read HEARTH-notes § Watchlist, backlog § Watchlist follow-ups, changelog v391/v392/v451, `index.html` lines 1291–1297 (header), 4284–4830 (helpers, `watchRowHTML`, `renderWatchlist`, `watchRandomPick`, editor). No code edited.
- 02/09 end: notes complete and pushed. Colour-scheme section added after Cathal sent a screenshot. Nothing built; no version bump; no PR opened (review-only ask).
