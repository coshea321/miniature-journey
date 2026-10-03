# Hearth — data models (field lists and the places each must be added)

Moved verbatim out of `CLAUDE.md` in the 22/09/2026 docs housekeeping. `CLAUDE.md` is loaded into every session, and these sections (~12 KB, about half of it) are only needed when a change touches one of these stores, so they now live here behind a pointer. **The rules are unchanged** — if you are adding or changing a field on any store below, this file is required reading, not background.

## Trip data model — keep export/import in sync
**Whenever a new field is added to booking objects**, update all three of these in the same change:
1. **Export map** in `openTripEditor` (the `.map(function(b){ return {...} })` inside the `tpExport` click handler) — add the new field.
2. **`importTripFromJSON`** — add the field with a safe fallback (e.g. `field: b.field || ""`).
3. **`mergeBookingsIntoTrip`** — add the field with the same fallback.

Current booking fields in the export: `type`, `title`, `start`, `end`, `location`, `ref`, `notes`, `connectsFrom`, `boarding` (v292, "HH:MM" or ""), `gate` (v292), `seats` (v293, free text). Fields intentionally omitted: `id` (regenerated on import), `updated` (set to now on import).

## Plant data model — same rule, one table plus nine scalars
Plant import/export (v378, `plant-v1` files) iterates **`PLANT_SECTIONS`**, so adding a text section there flows through export, import and the AI prompt template automatically. The **scalar** fields are hand-listed in two places — **`plantExportObj`** and **`plantApplyImport`** — and a new one must be added to **both**: `name`, `latin`, `room`, `emoji`, `waterDays`, `feedDays`, `waterOff` (v430, boolean — skips the watering reminder entirely, for outdoor plants), `feedPauseFrom`/`feedPauseTo` (v430, months 1-12 — pauses the feed reminder for a season, e.g. September to April; 0 on either means no pause, and the range wraps across the year boundary when `from > to`), `photoLink` (v432, a URL to a picture of the plant kept elsewhere — **not** the `photo` thumbnail, and the only plant field that becomes a tappable href, so it goes through `applianceLinkUrl`, the shared http(s)-only gate, on save, on import AND at render time via `plantPhotoLinkUrl`; never add a second copy of that gate). Both reminder toggles are read by `plantDueIn`/`plantFeedPaused`, not by the interval fields themselves — `waterDays`/`feedDays` keep their value while a toggle is on, so switching it back off doesn't lose the interval. Intentionally never in a plant file: `id` (regenerated), `updated` (set to now), `photo`, `waterLog`, `feedLog` — import must never touch a photo or a care log.

**Multi-plant import matches by name (v433).** A `plant-v1` file holding several plants gets one destination dropdown per entry, defaulted by **exact** name match via `plantNameMatches` (case- and whitespace-insensitive): one match pre-selects it, several start **unset and block Import**, none defaults to "add as new". Applied through `importPlantsByPlan` — one `getPlants()`/`savePlants()` for the whole file, deliberately not a loop over `importPlantInto`. **Never make the matching fuzzy** (no Levenshtein, prefix or substring): a wrong auto-match silently overwrites the wrong plant's care notes, and the most similar names in a plant book are the ones most likely to be different plants.

## Home inventory data model — one file, two hand-listed halves
The Home inventory (v424 as Appliances, widened v428) has **no `PLANT_SECTIONS`-style table**, so a new field is added by hand in five places, and the `inventory-v1` file needs **both** of its halves or the field is silently dropped on a round trip:
1. **`renderApplianceEditor`** — the markup AND the save handler's `fields` object.
2. **`renderApplianceDetail`** — the row.
3. **`applianceSearchText`** — if it is worth searching for.
4. **`inventoryExportObj`** — the field going out to a file.
5. **`inventoryRecordFrom`** — the field coming back in, with a safe fallback.
Plus **`buildTestSeed`**, per the section below.

Current fields: `name`, `area`, `brand`, `model`, `serial`, `fd` (v431, the factory-date code on Bosch/Siemens rating plates), `bought`, `warranty`, `boughtFrom`, `value` (v428, number or `""`), `receipt` (v428), `manual`, `photos` (v428, a link — never image bytes), `notes`. Intentionally omitted from the file: `id` (regenerated on import), `updated` (set to now), `addedBy`/`added`. **A cleared field stores `""`, never a dropped key** — `mergeApplianceData` refills `undefined` keys from the other device (the v296 rule), so an absent field comes back on the next sync.

## Health data model — one store, one record type, seven kinds
The Health section (v449) is the family's **medical history**: GP visits and what was said, conditions, diagnoses, test results, medication, vaccinations and clinic contacts. It is a **record, not a log** — see `HEARTH-notes.md` § Sections for why nothing here logs medicine, doses or weight, and do not add any of those to it.

Every record lives in **one** array (`fl4_health`) and carries a **`kind`** from **`HEALTH_KINDS`** (`visit`, `diagnosis`, `condition`, `test`, `medication`, `vaccination`, `contact`), the way a trip booking carries a type. **Do NOT split it into a store per kind** — that would be seven merges, seven tombstone sets and seven pieces of the backup payload to keep in step forever.

**Three role lists decide where a record lands on screen — not the order of `HEALTH_KINDS`:**
- **`HEALTH_UPCOMING_KINDS`** (`visit`, `test`) — things you attend, so they can be future-dated. **A booked appointment is simply a visit whose date hasn't come yet**; when the day arrives you open the same record and fill in what was said. That is why there is no separate "appointment" kind, and why `healthCountdownLabel` returns `""` for every other kind — the Home Today line is driven straight off it.
- **`HEALTH_STANDING_KINDS`** (`condition`, `medication`) — states, not events, so they are pinned *above* the history rather than sorted into it by date.
- **`HEALTH_HISTORY_KINDS`** (`visit`, `diagnosis`, `test`, `vaccination`) — the events, rendered as **ONE mixed reverse-chronological feed**. That feed is what makes this a medical history rather than a filing cabinet; **do NOT split it back into a group per kind** — that was the pre-reframe shape and it was replaced deliberately on 31/08/2026. An undated event sinks to the bottom, never to the top.
- `contact` is in none of the three on purpose: a directory, listed last.

**`HEALTH_KIND_FIELDS` is the table**: which fields a kind asks for, and what the shared `title`/`date`/`who`/`dose`/`expiry`/`outcome`/`location` fields are *called* for that kind. Adding a kind means one row there, one entry in `HEALTH_KINDS`, and adding it to whichever role list it belongs in — nothing else. Adding a **field** is hand-listed in five places and all five must change together:
1. **`renderHealthEditor`** — the markup AND the save handler's `vals` object.
2. **`healthApplyKindToEditor`** — only if the field is kind-dependent (show/hide + relabel).
3. **`healthRowHTML`** — the detail row.
4. **`healthSearchText`** — if it is worth searching for.
5. **`buildTestSeed`**, per the section below.
The backup file needs no per-field edit — `fl4_health` goes out and comes back as whole records — but **a cleared field must store `""` (or `[]`), never a dropped key**: `mergeHealthData` refills `undefined` keys from the other device (the v296 rule), so an absent field comes back on the next sync.

Current fields: `kind`, `person`, `title`, `date`, `time`, `who`, `dose`, `expiry` (v454), `outcome`, `location`, `phone`, `files`, `notes` (plus `link`, retained only so an early v449 record still reads — see below). Intentionally omitted from a file: `id` (regenerated on import), `updated` (set to now), `addedBy`/`added`.

**`files` and `phone` are the only two things that become hrefs.** `files` is an array of `{label, url}`; **every url goes through `applianceLinkUrl`** — the shared http(s)-only gate — on save, on import AND at render (`healthFileList`). `phone` never emits the raw field at all: `healthPhoneHref` rebuilds a `tel:` href from digits and a leading `+`. **Never add a second copy of either gate** (the v428 lesson: two copies of a security check is how one of them drifts), and never emit either into an `href` without its helper — `esc()` stops attribute-breakout but does nothing about a scheme. `healthDateText` escapes its parts for the same reason: `date` also arrives from sync and restored backups, and junk still splits into three parts on `-`.

**Files are LINKS, never bytes** (the v428 rule). Hearth does not hold a scan or a consultant's letter — it holds a link to wherever that already lives. Do not add uploads.

**`healthFileList` reads the old single `link` field forward** as one unlabelled file when a record has no `files`. That is a read-time fallback, not a stored migration: the editor writes `link: ""` and only ever populates `files`. Don't "tidy" it away without checking no early record still relies on it.

**`expiry` is the prescription-runs-out date (v454), and it is medication-only BY THE FIELD TABLE** — `healthExpiryDays` returns `null` for any kind whose `HEALTH_KIND_FIELDS` row has `expiry:""`, so there is no second "is this a medication" test anywhere and there must not be one. Every record still *stores* `expiry` whatever its kind (the v296 rule: `""`, never a dropped key). The editor pairs it with a **Clear button** (the grocery due-date pattern) — an `<input type="date"` has no reliable clear affordance on a phone, so an optional date that drives a Home line must be unsettable without deleting the record. `HEALTH_EXPIRY_SOON_DAYS` (14, confirmed 02/09/2026) is the window; `healthExpiringSoon()` is what Home reads, sorted soonest-first. **An expired repeat deliberately does NOT self-suppress** — unlike `healthCountdownLabel`, which returns `""` for anything past, `healthExpirySoonLabel` keeps returning a phrase once the date is gone, and Home turns that line red. A repeat that has already run out is the most actionable state, not the least; don't "tidy" it into matching the countdown. Above one, the Home line collapses to a count (the plants rule). Formatting goes through **`healthDMY`**, shared with `healthDateText` — `expiry` arrives from sync and restored backups too, so never format it with a second copy of that escaping.

**`person` is free text with a datalist, never an enum** — `healthPeople` derives the list from the records in use. Do not convert it to a fixed set of family members; it would need a code change every time the family changes, and "Mum" is as valid an answer as a name.

**Three separate things in `index.html` are called "health" and none are each other**: this section (`sectionVisible.health`), a pre-existing always-true `syncPrefs.health` key with no UI toggle, and the grocery **category** id `health`. Commented at the `syncPrefs` line; do not tidy them together.

## Projects data model — two levels, like Trips (v499)
`fl4_projects` is an array of projects, each holding an `items` array. **Project fields:** `id`, `name`, `status` (`idea`/`planning`/`active`/`done`: `PROJ_STATUSES`, never free text, unknown reads as Planning), `target` (`YYYY-MM-DD` or `""`), `notes`, `items`, `addedBy`, `added`, `updated`. **Item fields, stored on every item whatever its type:** `id`, `type` (`task`/`quote`/`cost`/`contact`/`link`), `title`, `date`, `amount` (number or `""`), `who`, `phone`, `url`, `notes`, `done`, `sentAt` (0 or the time it was copied to To-do), `addedBy`, `added`, `updated`. `PROJ_ITEM_FIELDS` decides which fields a type shows and what they are called. A hidden field keeps its value.

**No field list to hand-edit for sync or backup:** `mergeProjectsData` rebuilds projects from both copies (`Object.assign(loser, winner)`) and field-fills items, and the backup carries whole records. A new **item** field needs: the fresh-item defaults and `vals` in `renderProjectItemEditor`, a `PROJ_ITEM_FIELDS` column if it is type-dependent, the row in `projItemRowHTML`, `projectSearchText` if searchable, and the `buildTestSeed` projects. A new **project** field needs `renderProjectEditor` (markup + `vals`), `renderProjectDetail`, and the seed. **A cleared field stores `""`, never a dropped key** (the v296 rule).

**Every read goes through `getProjects()`/`projItemsOf()`**, which coerce a missing or object-shaped `items` to an array. **Do NOT merge whole projects newest-wins** (see `HEARTH-notes.md` § Sections). `url` goes through `applianceLinkUrl` at save, restore and render. `phone` only becomes an href through `healthPhoneHref`.

## Golf data model — one store, two kinds (v500)
`fl4_golf` is an array of records with `kind` `"course"` or `"round"`. **Course:** `id`, `kind`, `name`, `holes` (9 or 18), `pars` (one number 3–6 per hole), `notes`, `addedBy`, `added`, `updated`. **Round:** `id`, `kind`, `date`, `courseId`, `courseName`, `holes`, `pars`, `strokes` (one number 1–15 or `""` per hole), `notes`, `addedBy`, `added`, `updated`. A round's `courseName`/`holes`/`pars` are a **snapshot** taken when it is started — never look them up from the course.

Whole-record merge (`mergeGolfData`) and whole-record backup, so there is no field list for sync. A new field needs: the editor's `vals` (`renderGolfRoundEditor` or `renderGolfCourseEditor`), `golfNormalise` if it is an array, the `golf:` block in `buildTestSeed`, and `tests/cases/86-golf.js`. **Every read goes through `getGolf()`** (Firebase returns a gappy array as an object). An unplayed hole is `""`, never a dropped entry.

## Baby bags data model — two levels, each merged by id (v478)
`bd.bags` is an array of bags, each holding an `items` array, and **both levels** union by id, newest-wins by `updated`, with their own tombstones (`fl4_tomb_bags`, `fl4_tomb_bagitems`) on both sync channels. **Every read goes through `normaliseBags`** (via `getBagsData`) because Firebase strips an empty `items:[]` and returns sparse arrays as objects — never read `bd.bags` directly. **Every write stamps the item AND its bag** (`touchBagItem`).

**Fields are hand-listed in `normaliseBags`/`bagItemShape`, and also in `mergeBags`' rebuilt bag object** — a new field must go in all three or it is silently dropped on the next read or merge. Bag: `id`, `name`, `icon`, `items`, `updated`. Item: `id`, `name`, `packed`, `updated`. Bags ride inside `fl4_baby`, so the backup file and test seed need no per-field edit.

**Defaults are seeded `updated:0` and never re-seeded once tombstoned** (v480) — a seed is the lowest-priority state, and re-seeding a deleted default only made it flicker.

## Pull-up Plan progress (`fl4_pullup`, v482) — one object, rebuilt from the plan
`{ checks:{ "w-s-e":[bool×sets] }, test:"", logged:{ "w-s":workoutId }, updatedAt }`, all indices 0-based into `pullupSessionExercises(w,s)`. Exercise order is therefore part of the key, so **never reorder or insert into a week's `exercises`**. Append only, or old ticks land on the wrong exercise. Hand-listed places: `pullupNormalise` (the only reader, which drops unknown keys), `pullupImport` (additive restore), `buildExportPayload` (`pullup:`), the `imported.pullup` counter + `IMPORT_LABELS`, and the `pullup:` block in `buildTestSeed`. It isn't synced.

## Track person tag (v486) — one optional `person` field on five stores
Track → Log, Medicine, Body and Food record for **Me, My wife or My daughter**, picked in `#trackPerson` (session-only, reset to Me each time Track is entered). The field is `person: "wife" | "daughter"`; **absent means Me** (`trackPersonOf`), so pre-v486 records need no migration and nothing ever writes `"me"` back into old ones. Stores carrying it: `fl4_action_log`, `fl4_track_med`, `fl4_food_log`, `workouts.bodyweight`, `workouts.bp`. Food daily notes (`fl4_food_notes`) key by `date` for Me and `wife:date` / `daughter:date` otherwise (`foodNoteKey`).

- **Merges:** action log, medicine, food and BP merge whole records by id/`ts`, so `person` rides along with no field list to update. **Bodyweight merges by `person + ":" + date`** in both `importBackupData` and `applyPersonal` — **do NOT revert either to date-only**, or two people's weights on the same day overwrite each other.
- **Readers must pick a side.** Track views filter by `trackPerson()`. Anything about Cathal's own numbers filters to `"me"`: `tdeeCurrentKg`, `measuredTDEE`, `tdeeIntakeToday`, `homeCalState`, `latestBodyweightKg`. A new reader of these stores that does neither will mix three people's data.
- Entries made outside the Track views (checklist auto-log, cardio, Recipes → food log) are Me.
- **Daughter + medicine:** Track → Medicine shows `#trkMedBabyNote` for her, pointing Calpol/Nurofen to Baby → Medicine, because Baby's dose-gap advisories never read `fl4_track_med`. Do NOT copy advisory logic into Track to "fix" this — dosing logic stays in Baby only.

## Test-build demo data (v407) — add to it when you add a section
Test builds (any host not on the exact-match `_prodHosts` list — the live `miniature-journey-b9p.pages.dev`, plus the retired `coshea321.github.io` — i.e. every raw.githack PR link and every Cloudflare branch/preview deployment) wipe the `fl4_*` store and reseed a fixed demo household **once per version** — the version string is stored in `fl4_testseed`, so a reload of the same version keeps whatever you were doing, and the next PR's link starts clean. The orange banner is the manual reset.

Three functions in `index.html`, all behind `_isTestBuild`: the phase-1 wipe (right under `_isTestBuild`, before any module-level code reads storage), `buildTestSeed()` and `resetTestData()` (just above `var bootSection`). The seed is applied through **`importBackupData()`** — the same merge the real backup restore uses — so it is defined in the **export payload shape** (`buildExportPayload`).

**`resetTestData()` wipes and RELOADS — it must never seed the live page (v408).** `loadListData` returns the in-memory `listData` whenever it is populated, and `importBackupData` is additive *by id*, so seeding in place silently keeps every edited copy already in memory and writes it back: deletions come back, ticks/renames/due dates don't. Wiping the `fl4_testseed` marker and reloading routes the reset through the same phase-1/phase-2 path as the auto-seed, where memory is genuinely empty. `tests/cases/39-test-build-reset.js` pins this with a deliberate regression tripwire — don't delete it if it fails, re-check the reset.

**When you add a new section or store, add demo content for it to `buildTestSeed()` in the same change** — the payload key must match `buildExportPayload`/`importBackupData` or it lands as nothing at all, silently. Ids come off `_tsId()` (fixed base, counter reset per call) and dates off `_tsDay`/`_tsAt`/`_tsTs` (relative to today) — keep both, or a re-seed stops being idempotent and the demo goes stale. `tests/cases/38-test-build-seed.js` asserts every section by count and pins the not-a-test-build guard; extend it alongside.
