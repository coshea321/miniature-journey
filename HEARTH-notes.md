# Hearth — Notes & State of Play (as of v266)

**This is the single source of truth for the Hearth project.** It combines: state-of-play (version log + what's pending), architecture & working notes, hard-won lessons, and the full `sw.js` source. There are no other Hearth context docs — if an older separate `HEARTH-architecture.md` or `HEARTH-state-of-play.md` is still in Project knowledge, delete it; this file supersedes both.

Update this file at the end of a session so a new chat can pick up cleanly.

## ⚙️ Maintenance habit (keep this note)
**After any major update — a new feature/section, or several version bumps — Claude regenerates this state-of-play doc as a downloadable file so Cathal can upload the fresh copy to Project knowledge.** Cathal can also just ask "update the state of play" any time. Re-upload the latest `index.html` / `sw.js` to Project knowledge at the same time, so a new chat reasons about the current app, not an old one.

## Current version
**v266 · 28/06/2026** — last shipped build (version label is now **date-only**, sourced from `sw.js` VERSION) (matches the `sw.js` snapshot at the foot of this doc).

## Recently completed (v230–v266)
- **v230:** Silenced routine "SSE stale — falling back to fetch" messages from the red error panel (changed `console.warn` → `console.log`; genuine SSE event-error warnings kept).
- **v231:** Fixed Notes sub-tab flashing on Grocery at login (set it hidden by default to match the switch-handler logic; Grocery has no Notes sub-tab by design — notes are per-item).
- **v232:** Built the **Recipes section** (6th nav icon). Recipe objects: name, servings, ingredients (amount/unit/name), method, notes. Servings stepper rescales live. Seeded with the Iced Coffee recipe. Create/edit via a raw-text editor.
- **v233:** Unit rule adjusted — tsp/tbsp **stay** tsp/tbsp at any serving; cups convert to grams (dry, via density table) or ml (liquid).
- **v234:** **Batch CSV recipe import** — RFC-4180 CSV parser handles quoted fields with embedded newlines/commas; maps title→name, quantity→servings, ingredients (parens stripped), instructions→method, source→notes; skips ingredient-less article rows; skips name-duplicates. Upgraded ingredient parser (fractions "1 1/2"/"1/3"/unicode, unit synonyms, count units that pluralise). Tested against the real 88-row MyRecipeBox export: 85 imported, 3 skipped.
- **v235:** Fixed a null `addEventListener` crash — recipe import sheet HTML sits after the main script, so its wiring is now deferred to DOM-ready and null-guarded.
- **v236:** **Recipe categories + favourites.** Star toggle on cards and detail view; "★ Favourites" filter chip; Category field in editor (with suggestions); filter bar per category; "All" view groups recipes by category with an "Uncategorised" group. Imported recipes start uncategorised.
- **v237:** **Add to grocery list from a recipe (Phase 1 — names only).** New 🛒 button on the recipe detail view. Pushes each ingredient *name* onto the Grocery list tagged with the recipe name (reuses the existing recipe-tag clear/revert machinery — existing items re-tagged with prior state recorded, not deleted). Also upserts a reusable saved-recipe chip in `fl4_recipes` at the recipe's **base servings** (quiet overwrite if the name already exists). New top-level fn `addRecipeToGroceries(recipe)` targets grocery directly (independent of `currentList`), with its own grocery-keyword category detection.
- **v238:** **Add to grocery — Phase 2 (amounts).** Grocery items now carry a separate **`item.amount`** field (Path B — amount is NOT baked into the name, so the name stays the clean dedupe key and no freeform-text parsing is needed). `cardHTML` renders it as a muted chip after the name (e.g. "Broccoli 200 g"); shows only when the field is present, so all other items / lists are untouched. Amounts scale at the **current stepper servings** (not base) via the existing `scaleIngredient`; Unicode fractions converted to ASCII ("½"→"1/2"); falls back to name-only when there's no clean amount (incl. the compound-amount parser gap). **New items get amounts; existing items are re-tagged only (their text/amount is never touched).** Saved chip in `fl4_recipes` still names-only at base servings. `addRecipeToGroceries` now takes `(recipe, mult)`.
- **v239:** **Recipe section headers fixed.** Lines like `<b>Base</b>` / `<b>Veg</b>` (or a line ending in ":") were being parsed as ingredients and pushed to the grocery list. Now detected via `isHeaderIng()` / `headerLabel()`: rendered as small uppercase **sub-headings** in the recipe detail view, and **excluded from the grocery push and the saved chip**. Detection is pattern-based, so it rescues already-saved recipes with no re-import. `parseIngredients` also flags new header lines with `header:true`.
- **v240:** **Recipes shared household-wide (merge-by-id).** Recipe book now syncs through the existing household `/shared` channel. Pushed on every mutation (all route through `saveRecipeBook`, which now calls `pushHousehold()`); `data["recipebook"]` added to the `pushHousehold` payload (always shared when a household is set, not gated by a per-section toggle). On pull, `applyHousehold` **merges by id**: partner's new recipes added to the top, same-id recipes take the incoming version. New-recipe ids hardened with a random component to avoid cross-device collision.
- **v241:** **Sync grace-period catch-up fix.** `handleHouseholdEvent` used to silently drop any SSE event arriving within the post-push grace window (`SSE_GRACE_MS`, effectively 5s) — so a remote change landing just after a local push was lost until the next event/focus. Now it schedules a single catch-up `fetchHousehold()` once the window closes (`_graceRefetch`), so remote edits reconcile instead of being missed. A pull never pushes, so no bounce; self-echo becomes an idempotent no-op. **Note:** the duplicate `SSE_GRACE_MS` declaration (3000 at line ~1795, 5000 at ~4357 — second wins) was left in place; the identical silent-drop bug in `handlePersonalEvent` (personal channel) was also left for a follow-up.
- **v242:** **Recipe sync → newest-wins by `updated`.** Replaced v240's merge-by-id / incoming-wins (which clobbered edits whenever a stale device pushed) with **newest-wins by per-recipe `updated` timestamp** plus a convergence re-push (`rbNeedPush`) when the local book is fuller/newer — applied on **both** the household and personal channels (the personal channel previously never merged the recipebook at all, so same-account devices could diverge). Every recipe is now stamped `updated` on create/edit/fav/import. Accepted costs (carried forward): recipe **deletions don't propagate**, and concurrent edits to the same recipe resolve newest-edit-wins (older edit lost).
- **v243:** **Sync send-wedge fixed (`try/finally`).** `applyHousehold` ran `renderRecipes()`/`renderBabyView()` inside the `syncPaused = true … = false` window with no exception guard — so if a render/merge threw mid-sync (e.g. while sitting on the Recipes section during an incoming update), `syncPaused` never reset and `pushHousehold` bailed forever after: that device became **receive-only, unable to send**. Now the whole body is wrapped in `try { … } catch { console.warn } finally { syncPaused = false; }`, so a throw can never wedge sending again; errors are logged and sync continues. **Confirmed working on-device** (Cathal's phone + laptop + Petra's tablet all sending/receiving). Diagnostic aid: any future apply error now surfaces as "applyHousehold error (sync continues)" in the console.
- **v244:** **Category quick-pick chips.** Recipe editor's Category field now shows previously-used categories as tappable chips beneath it (reliable on Android, where the `<datalist>` dropdown often didn't surface). Tap to fill; tap the active chip to clear; highlight stays synced if you type. Free-text field + desktop datalist retained. New helper `recipeCategoryChips()`. Pure UI, no sync/storage impact.
- **v245:** **List sync → union-by-id + newest-wins + tombstones.** Replaced the household **wholesale-replace** (which lost concurrent adds — the "grocery items vanish" bug, where `items: incoming` overwrote the local set) with a **union-by-id merge**: per-item `updated` newest-wins + deletion **tombstones** (`fl4_tomb_<lt>`, 7-day purge), applied identically on the household and personal channels. New shared helpers near `saveCurrentList`: `getTombs` / `addTomb` / `purgeTombs` / `mergeTombs` / `mergeListItems`. Items stamped `updated` on add / check-off / category-change; tombstones recorded on removeItem, clear-completed, and recipe-tag delete, and pushed in both list payloads (`deleted:`). Tombstones are transient sync metadata — deliberately **not exported/synced**. (This is the merge the rest of the sync notes refer back to; v247 later added the list convergence re-push that v242 already had for recipes.)
- **v246:** **Grace window removed — sync applies immediately.** Incoming SSE events were dropped for a rolling ~5s window after any local push (`SSE_GRACE_MS`, effectively 5000 via the duplicate decl), and every action — firing both a personal- and household-channel push — kept bumping that window, so during active use changes only applied ~5s after activity settled (the "navigate away to make the 2nd action show" symptom; personal channel dropped with no catch-up at all). Now obsolete: the v245 merge (union + newest-wins + tombstones) preserves local unpushed changes and makes a self-echo an idempotent no-op. Both `handleHouseholdEvent` and `handlePersonalEvent` now **apply immediately**. Removed both duplicate `SSE_GRACE_MS` declarations and the `_graceRefetch` timer. (`lastPushTs` still set on push but no longer read — trivial dead assignment.)
- **v247:** **List convergence re-push (the missing half).** With ~simultaneous adds on 3 devices, each pushes its whole list to the single `/shared` doc, so a later push can overwrite an earlier one before every device's SSE saw it — leaving `/shared` missing an item, and a device that only ever received the incomplete version (e.g. the laptop) never got it. The v245 merge kept local items but, for lists, never re-pushed the fuller set. Now `mergeListItems()` returns `{items, push}`; when our merged set is fuller/newer than incoming (or a tombstone needs propagating), both channels schedule a convergence re-push so `/shared` accumulates the union. Self-terminates once all devices agree. (Recipes have had this since v242 via `rbNeedPush`; lists were missing it.) **Confirmed working on three devices** — the 1/2/3 simultaneous-add case now converges without navigating.
- **v248:** **Recipe editor no longer closes mid-edit.** The recipe-sync re-render (`if (currentSection === "recipes" …) renderRecipes()` in `applyHousehold`/`applyPersonal`) used to repaint over the open editor when a sync landed, discarding unsaved input. Added a `_recipeEditing` flag (set in `openRecipeEditor`, cleared on save, cancel, and at the top of the `renderRecipes` dispatcher so it can't stick); both sync re-renders now skip while it's true. Incoming recipe changes are still merged/stored during editing — they just render on close. **Verified on-device.**
- **v249:** **Bulk recipe categorising.** "✓ Select" button at the top of the Recipes list → selection mode (checkboxes; tap a card to select). Bottom bar "Set category (N)" + Cancel; picker offers chips of existing categories, a new-category field, and "Set to Uncategorised". `applyBulkCategory()` sets the category on all selected, stamps each `updated` (syncs via newest-wins), and toasts the count. Selection works within the current filter (filter to Uncategorised → Select → set = fast way to clear the import backlog). **Verified on-device.** Note: built after a workspace-drift incident (a phantom "v249" with this feature appeared in the build copy but was never in the deployed app) — rebuilt cleanly on the re-uploaded real v248.
- **v250:** **Recipe method formatting (render-time, non-destructive).** Imported methods rendered as one run-on block because the detail view used `esc(r.method)`, which doesn't render newlines — but `cleanText` preserves newlines on import, so the breaks were in storage all along (a render bug, not a data problem). New `formatMethod()` honours line breaks (single → `<br>`, blank line → paragraph) and splits run-together numbered steps ("…cool. 2. Whisk…") onto their own line (conservative: 1–2 digit + ". ", so "350." / "1.5" are safe). Stored text untouched; the editor `<textarea>` still shows raw text. Applies to all recipes, no migration. **Verified on-device.**
- **v251–v253:** **Backup-on-open nudge + date/time.** Dismissible green banner suggests a backup when none in 7 days. Fires on app open: cold open (auto-login already calls `onLoginSuccess`) **and** resume-from-background (`visibilitychange`, only if away >30s, so quick switches don't flash it). "Back up now" runs the existing export (downloaded file) via the refactored `exportAllData()` and records `fl4_last_backup`; ✕ snoozes 2 days (`fl4_backup_snooze`). Backup filename now includes time (`hearth-backup-YYYY-MM-DD_HHMM.json`, no colons). Settings shows **"Last backup: <date time>"** under Export, updated on each export (`fmtBackupTime`/`updateLastBackupInfo`). `fl4_last_backup`/`fl4_backup_snooze` are transient (not exported/synced) — so the nudge is per-device; on Android the installed PWA + Chrome share origin storage, so they share the timestamp. (v252 used temporary 10-min/2-min test thresholds; v253 reverted to 7-day/2-day and added the filename time + Settings line.) **Tested: cold open + 10-min reshow on PWA.**
- **v254:** **`noindex` meta tag** added to `<head>` (`<meta name="robots" content="noindex, nofollow">`) to discourage search-engine discovery of the public Pages site. Protection still relies on the login gate; this only trims the find-via-search surface. README removed from the GitHub repo at the same time (app doesn't need it — Pages serves `index.html`/`sw.js`/`manifest.json`/icons).
- **v255:** **Partner-added-recipe toast.** Gentle "🍴 Petra added a recipe: \<name\>" (or "N recipes") when a new recipe arrives from the partner. New recipes now carry `addedBy`; the toast fires from the **household channel only** (no same-account double-fire across your own devices) and **skips the first-load bulk** (only on an already-populated device). Existing/unstamped recipes don't trigger it. **Verified on all three devices.** During verification, Petra's tablet briefly stopped syncing (received but couldn't send) — root cause was **low device storage evicting her saved login token/household code**, not a code bug; fixed by freeing space + re-login. (See "Sync troubleshooting" below.)
- **v256:** **"Today" pick on the General list.** A ☆/★ star on each General-list item marks it for "today" — a manual per-item **`today` boolean** (**option B**: a focus/filter view, *not* a recurring or daily-reset mechanism). Once anything's starred, a **★ Today (N)** filter chip appears at the top of General; tap to show only today's picks, tap again for all. Ticking an item done **auto-clears** its `today` flag. **No new sync machinery** — the flag rides the existing v245 union-by-id + newest-wins merge via each item's `updated` stamp, so it syncs across devices for free. Deliberately **persistent / no auto-reset** (you un-star or complete) to avoid any day-rollover/double-reset sync hazard. Scoped to General (`todo`) only. Stranded-filter guard: if the filter is on but nothing is starred (e.g. you completed the last pick), it auto-disengages so you can't get stuck in an empty filtered view with no chip to toggle off. **Verified on-device.**
- **v257:** **Accidental-tap fix — all detail lists.** Tapping just right of an item's checkbox used to open the notes sheet (the card click had a catch-all "everything else opens notes" zone), so a near-miss aimed at the checkbox dropped you into the editor. Notes now open **only when the item body text (`.item-body`) is tapped**; the gap between the checkbox and the body is a **neutral buffer** (does nothing), widened with a 5px left margin on the body. Check-off (the circle) and check-off behaviour are unchanged. Applies to all note-bearing lists (Grocery, General, Personal, Travel). **Long-press-to-open-notes was considered first and rejected** as too fiddly on touch (needs scroll-cancel, post-press click-suppression, native context-menu collision, and a haptic for discoverability). Easy future escalation if near-misses persist: also enlarge the checkbox's own tap target so a near-miss *checks off* instead of doing nothing. **Verified on-device.**
- **v258:** **Home-page weather card.** A slim card under the greeting shows current temp + condition emoji, with high/low and humidity on the right, for **Carrigaline (hardcoded coords 51.81, -8.39)**. Source is **Open-Meteo** (`api.open-meteo.com`) — **no API key, no signup**, so nothing secret in the public client file. **Device-local, never synced** (not via Firebase / union-by-id). Cached in `localStorage` under **`hearthWeather`**; refetched only if the reading is **>30 min old**. Degrades gracefully: paints cache immediately (with an "as of HH:MM" stamp when stale), skips network when offline, and on fetch failure with no cache the card **stays hidden** rather than breaking home render. **No `sw.js` logic change needed**: the existing fetch handler only intercepts same-origin requests (`url.origin === self.location.origin`), so the cross-origin Open-Meteo call falls through untouched and is never cached by the SW. Design confirmed up front: **hardcoded coords + minimal card with humidity**.
- **v259:** **Weather timestamp always visible.** The "as of HH:MM" reading time now shows **always**, not only when stale, so the reading's age is visible at a glance. The stale styling (card dims at >30 min) is unchanged. Tiny display tweak.
- **v260:** **Front-page to-do = today's picks.** The home-page to-do spotlight now shows **only tasks starred for today** (the v256 `today` boolean), and the section header is relabelled **"★ Today"**. Empty state reads **"🎉 No tasks for today"**. Implemented by adding a `todayOnly` flag to the shared `renderSpotlight(elId, lt, maxItems, todayOnly)` — grocery passes nothing and is **unchanged**; todo passes `true` and filters to `!x.done && x.today`. Completing a task auto-clears its `today` flag (v256), so it drops off the front page. **"See all →" still opens the full General list** (where the ★ Today filter chip lives). **Trade-off accepted:** on a day nothing is starred, the block reads "No tasks for today" even with a full General list — by design, it surfaces only deliberately-picked tasks.
- **v261:** **Home layout cleanup.** (1) **★ Today spotlight moved above Grocery.** (2) **"Active items" card removed** — its HTML, its populating JS, *and* its click handler all deleted (a dead `getElementById("tcLifeCard")` would have thrown). (3) **Training card → compact full-width strip** mirroring the Baby card's horizontal layout (icon left, "Training" + status middle, session count + label right); kept its original IDs (`tcTrainCount`/`tcTrainLabel`/`tcTrainSub`) so the session/kcal logic and tap-to-train behaviour are unchanged. Home order now: greeting → weather → Training strip → Baby strip → quick-add → ★ Today → Grocery → week strip.
- **v262:** **Weather detail sheet (3-day).** Tapping the weather strip opens a **bottom sheet** (existing `.overlay`/`.modal-box` pattern, × + backdrop-tap to close) showing today in detail (temp, condition, feels-like, humidity) and **three day-rows** (Today/Tomorrow/weekday: icon, high/low, 💧 rain chance, 💨 max wind in km/h), plus the "as of HH:MM" stamp. The existing fetch was **extended from 1 day to 3** (added `apparent_temperature`, `precipitation_probability_max`, `wind_speed_10m_max`) and the whole forecast caches in `hearthWeather`, so the sheet opens instantly from cache and works offline. Opening also triggers a **forced refresh** (`fetchWeather(true)`) so an older cache lacking 3-day data still fills in. Still **device-local, no Firebase, no SW change** (Open-Meteo stays cross-origin). **Not live-tested against the API from the build sandbox** (Open-Meteo blocked there) — field names are Open-Meteo's documented standard; live app is the real confirmation.
- **v263:** **Baby medicine quick-chips + sex-save fix.** (1) Added **Calpol / Nurofen / Antibiotic** chips inside `renderMedicine()` (the static chips at ~line 1069 are **dead code** — `renderMedicine()` rebuilds the view from scratch, so chips had to go in the render fn). Tapping a chip fills `medName` + a default dose (**Calpol 5ml, Nurofen 2.5ml**, Antibiotic blank) then focuses/selects the dose field — fill-and-edit, not auto-log. (2) **Fixed `babySex` not persisting:** the household-apply merge (`applyHousehold`, ~line 5269) rebuilt the baby object via `storeSet("fl4_baby", {...})` and **silently omitted `babySex`**, wiping it every sync cycle. Added `babySex: local.babySex || rb.babySex` (local wins, falls back to partner's device). The import path already had a guard; this was the missing second path.
- **v264:** **Weight-based medicine dosing.** Medicine chips now compute a default dose from her **latest logged weight** (`latestBabyWeight()`, new top-level helper — newest growth record with a numeric `weight`). Per-chip config lives in `data-` attrs: **Calpol** = 15mg/kg, 120mg/5ml (Calpol Infant); **Nurofen** = 10mg/kg, 100mg/5ml (Nurofen for Children); Antibiotic = no calc ("dose as prescribed"). Formula `ml = weight × mgkg × 5 / mg5`, **rounded DOWN to 0.25ml** (suggestion never exceeds the mg/kg calc), **capped at 10ml** single dose. **Floor guard:** Nurofen **blocked under 5kg** (ibuprofen contraindicated) — fills no dose, shows a check-GP note. **No weight logged →** falls back to flat 5ml/2.5ml with a "log a weight" note. A `#medDoseNote` line under the dose field always shows the working + product strength + "estimate only, check the leaflet" (set via `textContent`, ASCII only). All editable. **Caveat baked into notes, not just the UI:** the ml is only correct for the two confirmed strengths above — switching to **Calpol 6+ (250mg/5ml)** would make the suggestion ~2× too high; the inline strength label is the guard. Uses latest weight regardless of age, so a stale weight gives a stale dose (the note shows the kg used). **Confirmed with Cathal up front; council declined.**
- **v265–v266:** **Version-label timestamp clarified, then simplified.** Diagnosed a "wrong time" report on the bottom-of-page label: it is **not a live clock** — the HTML label is overwritten at runtime by the `sw.js` `VERSION` constant via the `SW_VERSION` postMessage, so it always shows the *active service worker's* build stamp and can lag until the new SW activates. v265 was a no-op timestamp bump to test this; v266 **dropped the `HH:MM` from the format** (now `vNNN · DD/MM/YYYY`) so a frozen build stamp can never be misread as a stale clock. No logic change. Also established: previewing the full PWA in the Claude file-preview pane shows blank because the sandbox blocks the external DOMPurify CDN / inline scripts — the app renders fine deployed (verified via headless boot producing the full DOM); the preview pane is not a reliable way to view this app.

## Recipes section — current shape
- Store: `fl4_recipebook` — **shared household-wide** (newest-wins-by-`updated` merge via `/shared`, plus same merge on the personal channel for same-account devices); separate from grocery-import `fl4_recipes`.
- Section headers: `<b>…</b>` / "Label:" lines render as sub-headings in the detail view and are excluded from the grocery list (`isHeaderIng`).
- List view: filter bar (All / ★ Favourites / per-category chips), grouped by category in All view.
- Detail view: servings stepper, ingredients (scaled per unit rules), method, notes, fav star, **🛒 Add to grocery list**, Edit/Delete.
- Editor: name, serves, category (datalist-suggested), ingredients (one per line "amount unit name"), method, notes.
- Import: ⬇ Import button → paste CSV → live "N recipes found" preview → Import.
- Unit rules: tsp/tbsp fixed; cups→g (dry) or ml (liquid); counts pluralise.
- Add-to-grocery: tag = recipe name; **amounts** carried as a separate `item.amount` field on grocery items, scaled to current servings (names-only fallback when no clean amount); saves a reusable chip at base servings.

## Pending / next steps (not yet built)
- **Add-to-grocery Phase 3 — real-world purchase quantities.** Convert cooking amounts to shop quantities, e.g. "1200ml oat milk" → "2× 1L bottles". **Council-reviewed; on hold.** Consensus = build thin + advisory (static in-code staples table, render-time from stored numeric amount, show both cooking + suggested pack, only mass/volume convert) — but a real logged dissent (Devil's Advocate) that the coverage cliff + upkeep may not clear the bar. Three open calls before building: show-both vs replace; table scope (~15–20 Irish staples); whether to heed the dissent.
- **Manual amount editing.** The item edit sheet doesn't expose `item.amount` yet — amounts currently come from recipes only. Small follow-up. Low priority.
- **Recipe deletions don't propagate** across devices (newest-wins keeps a recipe the other device still has). For now, delete on both devices. Future option: soft-delete/tombstone records so removals sync.
- **Pre-v242 recipes are unstamped** (`updated` absent → treated as 0). Edit each once post-v242 to fully protect it under newest-wins. Optional one-off: stamp all existing recipes on next load.
- **Imported recipes default to "Uncategorised"** — Cathal to categorise over time (the v249 bulk-categorise tool makes this fast: filter to Uncategorised → Select → set).
- **Possible future backup enhancement:** an auto-copy into Firebase `/backups`, or a periodic reminder independent of app open (current nudge is on-open only).
- Known minor parser gaps: compound amounts like "1 ¾ cups + 2 tbs Greek yogurt" keep the whole string as the name (don't scale → land as name-only on grocery); "Garlic - 2 cloves" (name-first) doesn't split the amount cleanly. Rare; acceptable.
- Open question (low priority): whether to sync the travel tag pool / recipe categories across devices (currently localStorage, so per-device; per-item tags DO sync).

## Shipped (reverse order, condensed — full detail in version log above)
v266 version label date-only · v265 timestamp diagnostic bump · v264 weight-based medicine dosing · v263 baby medicine quick-chips + babySex-save fix · v262 weather 3-day sheet · v261 home layout cleanup · v260 front-page ★ Today · v259 weather timestamp · v258 weather card · v257 tap-zone fix · v256 "Today" picks · v255 partner-recipe toast · v254 noindex · v251–253 backup nudge · v250 method formatting · v249 bulk categorise · v248 recipe-editor-no-close · v247 list convergence re-push · v246 grace window removed · v245 union/newest-wins/tombstones · v243 sync send-wedge fix · v242 newest-wins recipe sync · v241 grace catch-up · v240 recipe sync · v237–239 add-to-grocery (names→amounts→headers) · v236 recipe categories+favourites · v234 CSV import · v232 Recipes section.

## Open decisions on record
- Add-to-grocery: **Option B** chosen (push items to Grocery **and** save a reusable chip in `fl4_recipes`). Saved chip stored at **base servings**. Re-tapping **updates the chip quietly + always re-adds the tagged items**.
- Add-to-grocery amounts (Phase 2): **Path B** chosen — amount is a **separate `item.amount` field**, not baked into the name (keeps name as dedupe key, avoids freeform parsing, and gives Phase 3 something to build on). Scale at **current stepper servings**; **new items get amounts, existing items re-tagged only** (never overwrite a hand-typed quantity). Base-vs-current divergence is deliberate: chip = base, grocery labels = current.
- Play Store + push notifications: rejected as disproportionate; app stays personal/family.
- Direct Claude↔GitHub editing: rejected to preserve the manual review checkpoint.
- Recipe sharing: started as **merge-by-id / incoming-wins** (v240), which clobbered edits when a stale device pushed. Replaced in **v242** with **newest-wins by `updated` timestamp + convergence re-push** on both the household and personal channels. Accepted costs: **deletions don't propagate**, and concurrent edits to the same recipe resolve as newest-edit-wins (older lost). Recipes are shared whenever a household is set (no per-section toggle).
- List sync model (v245): **union-by-id + per-item `updated` newest-wins + deletion tombstones**, applied identically on the household and personal channels (replaced the old household wholesale-replace, which lost concurrent adds). Tombstones (`fl4_tomb_<lt>`) are transient sync metadata, 7-day purge, deliberately excluded from backup/export.
- Recipe stores kept separate: `fl4_recipebook` (Recipes section) vs `fl4_recipes` (grocery quick-import).
- **"Today" view (v256): Option B** chosen — a manual **pick-for-today focus view**, not a recurring/daily-reset flag. **Persistent (no auto-reset)** so it adds zero new sync machinery (rides the per-item `updated` merge); surfaced as a **filter chip on General**, not a separate tab; **completing an item clears its `today` flag**; scoped to General only. The recurring/auto-clear alternative was rejected to avoid day-rollover + double-reset sync hazards.
- **Accidental-tap fix (v257): neutral-buffer approach** chosen — notes open only on the item body text, with a dead-zone gap beside the checkbox. **Long-press-to-open-notes was rejected** as too fiddly on touch (scroll-cancel, click-suppression, native context-menu collision, weak discoverability). Applies to all detail lists, not just General.


---
---

# Hearth — Architecture & Working Notes

A reference for any new chat working on the Hearth PWA. Read this first.

## What Hearth is
- A family-hub Progressive Web App for two people (Cathal + partner Petra).
- **One single-file vanilla HTML/JS app**: `index.html` (~9,550 lines, ~557k) plus `sw.js` (service worker).
- No build step, no framework. Plain HTML/CSS/JS.
- **Hosting:** GitHub Pages at `coshea321.github.io/miniature-journey`
- **Storage:** localStorage (primary) + Firebase Realtime Database (household sync between the two users)
- **Users:** `cathal1` (Cathal) and `petra`. Items can carry `addedBy` and sync between devices.

## Who maintains it & how
- Cathal is a **non-coder**, editing via the **GitHub web editor on a Redmi Note 14 (HyperOS) phone**, occasionally a laptop.
- Claude works on the file directly and hands back finished `index.html` + `sw.js` to download — Cathal does NOT paste the file into chat.
- Cathal reviews and commits manually (this human checkpoint is deliberate — keep it).

## Sections (bottom nav, 6 icons)
Home · Lists · Train · Recipes · Notes · Baby

- **Home:** order is greeting → weather → Training strip → Baby strip → quick-add → ★ Today → Grocery → week strip (v261 layout). **Weather card** under the greeting (v258): current temp + condition + humidity + high/low for Carrigaline, via Open-Meteo (no key); device-local, cached in `hearthWeather`, refetched only if >30 min stale; hidden if no data and offline; "as of HH:MM" timestamp always shown (v259); **tap opens a 3-day detail sheet** (v262: feels-like, humidity, per-day high/low + 💧 rain chance + 💨 wind). **Training strip** (v261): compact full-width horizontal card (sessions today + kcal), taps through to Train. **Baby strip:** last medicine + latest weight. **"★ Today" to-do spotlight** (v260, moved above Grocery in v261): only tasks starred for today (v256 `today` flag), empty state "🎉 No tasks for today". The old "active items" tile was removed in v261. Grocery spotlight unchanged.
- **Lists:** Grocery, General (todo), Personal, Travel. Collapsible categories, per-item notes/links/due dates, search (fuzzy, toggleable), print, import, duplicate highlighting, partner-added "NEW" indicators, expand/collapse all. Travel has multi-tag items + a tag filter bar (incl. "Untagged"). Grocery has recipe-tag import (tag a batch, clear/revert as a group) with reusable saved recipes. **General has a "Today" pick** (v256): a ☆/★ star per item sets a manual `today` boolean, with a **★ Today (N)** filter chip at the top; ticking an item done clears its today flag; it syncs via the normal per-item `updated` merge (no separate machinery). **Tap zones on item cards** (v257): the circle checks off; the **item body text (`.item-body`) opens the notes sheet**; the gap between them is a deliberate neutral buffer (does nothing) so a near-miss on the checkbox doesn't open notes. Category pill, ★ star, and ✕ delete are their own zones.
- **Train:** yoga flows + physio programmes. Every exercise timed/auto-advancing; one-sided exercises are explicit (Right)/(Left) entries each with their own chime. tsp/tbsp-style timing rules don't apply here.
- **Recipes:** recipe book with ingredients/method/servings/notes, servings scaler, categories + favourites, CSV batch import.
- **Baby:** growth (WHO weight-for-length), medicine, milestones, teeth, packing bags, sex selector.

## CRITICAL technical quirks (these cause bugs if ignored)

1. **38 interleaved duplicate Train functions.** Many Train/body/history functions exist as TWO copies. Edits targeting them must hit BOTH copies — a grep count of 2 is correct and expected. (Baby render functions are single copies.)

2. **Two real `<script>` blocks — syntax-check the RIGHT boundary.** The file has one external script (DOMPurify, self-closed) then the **main inline app block**; a third `<script>` appears only *inside a JS string* (the print-doc) and is not a real block. To check the main app code, extract from the `// PREVIEW MODE` comment to the **FIRST** `</script>` after it, then `node --check`. **Using the LAST `</script>` produces a convincing FALSE error** — it sweeps up the print-doc HTML string and other script blocks, and `node --check` reports a syntax error (often "Unexpected token '<'") that is NOT real. If a syntax error appears, first confirm you used the first-`</script>` boundary before chasing it. **Also: never hard-code the boundary line number from a previous version — every edit shifts line numbers, so a stale `sed -n 'A,Bp'` range will truncate the script mid-code and throw a false "Unexpected end of input". Re-derive the first-`</script>` line dynamically each time (e.g. `awk 'NR>=START && /<\/script>/{print NR; exit}'`) before extracting.**

3. **Python `str_replace` fails silently.** Always grep-verify a replacement actually landed (count occurrences before/after).

4. **Never write at a computed index without checking `find()` succeeded.** The v221 corruption came from a Python edit where `find()` returned −1 and the code then wrote at `idx + len(...)`, which appended a FULL DUPLICATE of the document after `</html>` — doubling the file to ~923k chars (two "Hearth" headers, raw `no-cache` meta visible as text, broken nav). If a find/anchor might miss, assert it found something before slicing/inserting.

5. **End-of-file edits are dangerous — verify structure after.** After ANY edit near the end of the file, verify: total length is sane (**~557k at v266**, growing slowly each version — a sudden jump to ~900k+ means the v221-style doubling), exactly ONE real `<html lang>`, ONE version string, DOCTYPE count of 2 (one real + one inside the print-doc JS string). The fix for the v221 doubling was truncating at the first `</body>\n</html>`.

6. **Scope: helpers called from top-level renderers must be top-level.** `renderList`, `openItemSheet`, `switchSection` etc. are top-level functions. A helper they call (e.g. `getTravelTags`, `renderItemSheetTags`) that is accidentally defined INSIDE a setup/IIFE block throws "X is not defined" the moment the renderer runs (this was the v226 bug). Define such helpers at top level.

7. **Bottom-of-page sheet wiring must run after DOM-ready or be null-guarded.** Several sheets (import, recipe import, item sheet) have their HTML near `</body>`, AFTER the main script. Code that calls `getElementById(...).addEventListener` on those elements at top-level script time hits `null` (the v235 crash). Either defer wiring with `DOMContentLoaded` (with an `else wire()` fallback if already loaded) or null-check every element before wiring.

8. **`confirmDialog` is OK/Cancel only.** It does NOT take custom button labels or a third option. When a 3-way choice is needed (e.g. recipe clear: delete added / keep added / cancel), hand-build a small overlay dialog — don't assume confirmDialog can do it.

9. **Check whether a feature already exists before building it.** This codebase has had features added across many sessions; some are present but not in any summary. Twice, work was started on something already built (list search; a collapse-arrow CSS rule). grep for the feature's likely identifiers first.

10. **`var history` conflicts with `window.history`.** Declaring `var history = []` (or any value) in browser global scope silently fails in some Android Chrome versions — `window.history` is a protected browser object and the assignment is ignored, so `history.sort()` later operates on the real `History` API and blows up. **Never use these names as global variables:** `history`, `location`, `name`, `status`, `frames`, `top`, `parent`, `self`. Use `hist`, `loc`, `roomName`, etc. instead. (Discovered building FreshList v3-v4; caused items to disappear after first add.)

11. **Firebase SSE self-echo race condition.** Every local push to Firebase triggers an SSE event back to the same device carrying the pre-push state. If that event is applied naively it overwrites locally-added items — the "items disappear after 8 additions" bug. The v245/v246 Hearth solution (union-merge + newest-wins + tombstones, apply immediately) already handles this correctly. If ever revisiting sync: **do not re-introduce a blanket grace-window that drops all SSE events** — it silently kills incoming changes from other devices. The right model is merge-then-re-push-if-fuller, not drop.

12. **Format toolbar on mobile goes at the bottom.** When building any rich-text editor with a toolbar, put the toolbar at the **bottom** of the screen. Android's native text-selection popup (Copy/Cut/Paste) appears near the selected text, which is usually in the upper part of the editor — directly over a top toolbar. Bottom toolbar avoids the collision entirely. Use `padding-bottom: max(10px, env(safe-area-inset-bottom))` to respect the home indicator on notch devices.

13. **PWA manifest icons must be real PNG files with separate `any` and `maskable` entries.** Using SVG data-URIs in manifest `icons` or combining `"purpose": "any maskable"` into a single entry prevents Chrome from showing the install prompt. Always generate actual `.png` files and list them as two separate objects:
    ```json
    {"src":"icon-192.png","sizes":"192x192","type":"image/png","purpose":"any"},
    {"src":"icon-192.png","sizes":"192x192","type":"image/png","purpose":"maskable"}
    ```

## Data & export
- Export auto-includes anything nested in `getWD()` (workouts incl. bodyweight/bp), `getBD()` (baby incl. growth/medicine/milestones/teeth/bags/babySex), `getActionLog()` (incl. cardio), plus list items themselves (incl. per-item `amount`, `tags`, `today`, `recipe` fields).
- Top-level stores also exported: `food_log`, `food_notes`, `saved_meals`, `cal_goal`, `secVisible`, `syncPrefs`, `recipes` (grocery import recipes), `travel_tags`, `recipebook` (Recipes section).
- A coverage-checklist comment sits above `exportData`. **Only touch export if a brand-new top-level `storeSet` key is added** outside the nested structures above.
- **Deliberately NOT exported/synced** (transient or device-local): `fl4_tomb_*` (deletion tombstones, 7-day purge), `hearthWeather` (weather cache), `fl4_last_backup` / `fl4_backup_snooze` (backup-nudge timing), `fl4_catOpen_*` / `fl4_doneOpen_*` (UI state), `fl4_seen_*` / `fl4_unseen_*` (partner-item tracking).

## Key storage keys
`fl4_workouts`, `fl4_baby`, `fl4_action_log`, `fl4_food_log`, `fl4_recipebook` (Recipes section — **shared household-wide** via newest-wins merge), `fl4_recipes` (grocery import recipes), `fl4_travel_tags`, `fl4_tomb_<lt>` (list deletion tombstones, transient), `fl4_catOpen_*` / `fl4_doneOpen_*` (UI state, NOT exported), `fl4_seen_*` / `fl4_unseen_*` (partner-item tracking, NOT exported), `fl4_secVisible`, `fl4_syncPrefs`, `fl4_last_backup` / `fl4_backup_snooze` (backup nudge, transient), `hearthWeather` (weather cache — current + 3-day forecast; device-local, NOT exported, NOT synced).

## Recipe unit rules (Recipes section)
- tsp and tbsp **stay** as tsp/tbsp at any serving size (do not convert to ml).
- ml stays ml.
- cups convert to **grams** for dry/weighable ingredients (via a name-matched density table) or **ml** for liquids (1 cup ≈ 240 ml).
- Counts (cloves, cans, slices, pieces, cubes, pinches) scale as whole numbers and pluralise.

## Standard per-change workflow
1. Remind Cathal to create a `backup-vXXX` branch first; suggest deleting branches older than 3 versions back. Never delete `main`.
2. Edit incrementally — never rewrite the whole file.
3. grep-verify replacements landed.
4. Syntax-check the main script block (PREVIEW MODE → first `</script>`) with `node --check`.
5. Verify file length / single DOCTYPE-pair / single version string.
6. Bump the version string in BOTH `index.html` and `sw.js`. Format: **`vNNN · DD/MM/YYYY`** (date only — no `HH:MM`). The displayed bottom-of-page label is sourced from the `sw.js` `VERSION` constant at runtime (the HTML label is overwritten via the `SW_VERSION` postMessage), so `sw.js` is the source of truth for what the user sees; a stale-looking version means the new SW hasn't activated yet, not a bug.
7. Present the updated files for download.
8. **On a major release** (new feature/section, or several bumps at once), also produce a **single datetime-stamped backup zip** bundling the main files — `index.html`, `sw.js`, `HEARTH-notes.md`, plus a short `MANIFEST.txt` (version + which file goes to GitHub vs Project knowledge). Name it `hearth-vNNN-YYYYMMDD-HHMM.zip`, **flat (no nested folders)**. Cathal extracts and distributes from there. This is his preferred release flow: extraction lands the files in a fresh dated folder, which sidesteps the HyperOS download-collision dance AND gives a complete known-good restore point per release (complements the GitHub backup branches). For small/diagnostic single-file tweaks, loose files are fine — the zip is for real releases.

## Device/workflow notes
- Download collisions on the Redmi: delete the old `index.html`/`sw.js` in the Files app before downloading the new ones (HyperOS lacks reliable "save as").
- GitHub uploads/edits on mobile: use **Chrome with "Desktop site"** — the GitHub app can't edit/upload files. Pasting into the web editor avoids the download/rename dance.
- Keep dated local backups of a known-good `index.html` outside GitHub too — the per-release backup zip (workflow step 8) is exactly this, automated.
- **Release zip extraction** is the active distribution method on the Redmi: download the one zip → extract in Mi File Manager → upload the extracted `index.html`/`sw.js` to GitHub and all three files to Project knowledge. Verify zip extraction stays smooth on the device; if it ever gets fiddly, fall back to loose files.

## Review council (on request)
When Cathal says "use my council" / "council review", run the 7-expert template: PWA/Mobile UX, Healthcare/Wellness (physio safety), Firebase/Sync, Accessibility, Privacy, Non-Technical Parent, Devil's Advocate — independent views, then a consensus with per-expert confidence.

## Sync troubleshooting
- **A device receives but can't send.** Most likely cause is NOT a code bug. On Petra's tablet (during v255) the root cause was **low device storage evicting the saved login token / household code** from localStorage — so the device could read the shared doc but had no credentials to push. The tell is a network/auth error on login or a silent failure to send. **Fix: free up storage, then re-login** to restore the token + household code. (If it were code, the v243 `try/finally` guard would have surfaced "applyHousehold error (sync continues)" in the console — check there first to rule code in or out.)
- **Changes apply slowly / only after navigating away.** Was the pre-v246 grace-window symptom; removed in v246. If it recurs, do NOT reintroduce a blanket SSE grace window (see lesson #11) — the correct model is merge-then-re-push-if-fuller.


---

## Cross-app lessons (from My Health session, June 2026)

Lessons from a parallel vanilla React PWA session that apply equally to Hearth:

14. **`<\/script>` with a literal backslash causes a blank page with no JS errors.** Chrome's HTML parser looks for `</script` (case-insensitive) to close a script element. `<\/script>` — with a backslash — does NOT match, so external `<script src="…">` tags appear unclosed and the main inline script block never executes. The page renders blank and the console shows nothing from the app (only extension noise). This creeps in from editors or copy-paste that escape closing tags for use inside JS strings. Fix: `sed -i 's/<\\\/script>/<\/script>/g'` or a plain find/replace in the GitHub editor.

15. **Edge Tracking Prevention blocks unpkg.com/CDN scripts on `file://` URLs.** Microsoft Edge treats external CDN requests (React, etc.) as third-party trackers when the page is served from `file://`. Result: React never loads, page is blank. The tell is `"Tracking Prevention blocked access to storage for <URL>"` in the console — NOT a JS error. Fix: use Chrome for local PWA development, or serve via `npx serve .` on localhost.

16. **Browser extension errors in the console are not app errors.** The Apollo Client DevTools extension logs `content.js: ApolloClient connectToDevTools` on every page load regardless of what the page does. It is completely benign. In general, if an error references `content.js` and a line in the hundreds/thousands, it is an extension content script, not app code.

17. **Image-to-named-item mapping must always be user-verified.** Never guess photo→pose (or photo→anything) mappings from album order, filenames, or sequence. Always ask the user to open each URL and read the label/content directly. Wrong mappings are completely invisible at code time and only show up visually in the app.

18. **bash tools can go unavailable mid-session.** When `bash_tool` and `str_replace` become temporarily unavailable, present pending changes as clearly-labelled code artifacts with exact find/replace strings so the user can apply them manually or carry them to the next session. Never silently drop changes that were discussed but couldn't be applied.

19. **Per-leg/per-side timer pattern.** For timed physio/exercise exercises requiring separate timers per leg or side: add `sets:2, perLeg:true` to the exercise data object; in the UI, check `ex.perLeg` to show `"Right leg"` / `"Left leg"` instead of `"Set 1 of 2"` / `"Set 2 of 2"`. All other exercises with `perLeg` absent fall back to the normal set label automatically.

---
---

## sw.js — FULL SOURCE LIVES HERE (this block IS the file)
**Read this before saying sw.js is "not available" — it is not a separate Project upload, it is reproduced in full below, and this block is the authoritative copy.** To bump or edit `sw.js`: reconstruct the file verbatim from the code block, apply the change, and deliver `sw.js` for download alongside `index.html`. Never tell Cathal sw.js is missing or that you only have `index.html` — the complete source is right here.

It is a **single-source-of-truth file**: changing the one `VERSION` line below updates the cache name (`CACHE`) and the SW version message together, so a routine version bump is a **one-line edit** to `VERSION`. After every bump, update this block to match (keep it at the current version) so the next chat reasons about the live SW.

Current version: **v266**.

```js
// ── Single source of truth — bump this and everything updates ──
const VERSION = 'v266 · 28/06/2026';
const CACHE   = 'hearth-' + VERSION;

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Install: cache all assets, skip waiting immediately
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: delete old caches, take control, tell pages to reload + send version
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SW_UPDATED', version: VERSION }));
      })
  );
});

// Respond to version requests from the page
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'GET_VERSION') {
    e.source.postMessage({ type: 'SW_VERSION', version: VERSION });
  }
});

// Fetch: cache-first for same-origin assets, but never cache sw.js itself
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Never intercept requests for the SW file itself
  // Never cache sw.js or index.html — always fetch fresh
  if (url.pathname.endsWith('/sw.js')) return;
  if (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')) return;
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return response;
        });
      })
    );
  }
});

```
