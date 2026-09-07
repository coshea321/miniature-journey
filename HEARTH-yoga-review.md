# Hips & Lower Back — flow review

**Written 05/09/2026 (Opus 5 session), committed 07/09/2026. Reviewed against `index.html` at v462; the flow is byte-identical at v467, so this still describes the live content.**

> **This is preparation for a physio appointment, not a clinical assessment and not a decision.**
> It compares the poses in the `Hips & Lower Back` flow against the constraints **Hearth itself already records** in `YOGA_TRAIN_NOTES[0]` (the Full Body Flow note). It says where the app's two flows contradict each other. It does **not** say any pose is unsafe for Cathal — that is a clinician's call on findings this document does not have.
>
> **No session may act on this file to change poses.** The rule in `HEARTH-backlog.md` § TRAIN CONTENT stands: which poses to drop or modify is a decision for Cathal and his physio. When he has decided, *that* decision gets recorded and built — not this analysis.

## Why this exists

`YOGA_FLOWS_TRAIN` holds the two flows Cathal actually uses: **Full Body Flow** and **Hips & Lower Back**. Full Body was re-tuned on 30/08/2026 against his precise history and carries a long note saying so. **Hips & Lower Back has an empty string in its `YOGA_TRAIN_NOTES` slot** — it has never been checked against any of it.

The v457 council review raised a version of this, but examined `Decompression` and `Max Pilates Core`, which Cathal confirmed on 05/09/2026 he does not use. The flow that needed looking at was the one it didn't open.

## The standard being applied

Verbatim from Full Body's own note:

- **Foraminal** (not central canal) narrowing at L5/S1 closes on **extension, side-bending and rotation**
- The **L4/L5 disc bulge** is loaded by **end-range and loaded flexion**
- Therefore the target is **the middle of the range in both directions**
- *"The general 'flex to open the canal' advice is written for central canal stenosis and only half applies to you"*

The **4 cm hiatus hernia** is handled separately in that note: practise 2–3h after eating, not in the first hour after waking, no breath-holding, and stop for regurgitation or upper-abdominal pressure. That implicates sustained abdominal compression and head-below-heart positions.

`Hips & Lower Back` displays none of this.

## Pose by pose

| # | Pose | Hold | Mechanism touched |
|---|---|---|---|
| 1 | Seated Forward Fold Variation | 60s | Cue asks for **rounding**, not hinging (*"drape your heart over the thighs"*, *"breathe into the back body"*) — sustained end-range flexion; abdominal compression |
| 2 | Core Stability Boat Prep | 30s | **Loaded** lumbar flexion; raises intra-abdominal pressure; the classic breath-holding pose |
| 3–4 | Seated Spinal Twist ×2 | 30s ea | Sustained **end-range rotation** |
| 5–6 | Head-to-Knee ×2 | 30s ea | Flexion, and asymmetric — adds rotation/side-bend |
| 7 | Bound Angle Diamond Fold | 60s | Cue is a proper hip hinge, but 60s of forward fold = abdominal compression |
| 8 | Swimming Side Stretch | 8/side | **Repeated side-bending** in a straddle — the only repetitive side-bend in the flow |
| 9 | Seated Forward Fold | 60s | End-range flexion held 60s, reaching for feet |
| 10 | Froggy Pose | 30s | Folded forward, hips low, head low — compression |
| 11 | Yogi Squat | 30s | Deep squat: end-range flexion + high intra-abdominal pressure |
| 12 | **Standing Forward Fold** | **60s** | **See below** |
| 13 | Knees to Chest | 30s | *Unloaded* supine flexion — much gentler; likely fine |
| 14–15 | Eagle Legs Twist ×2 | 30s ea | Sustained rotation, though unloaded |
| 16 | Happy Baby | 30s | Unloaded, but end-range posterior tilt |
| 17 | Windshield Wipers | 30s | **Mid-range, moving, unloaded — the best-designed pose here** |
| 18 | Savasana | 90s | Neutral |

Roughly **twelve of eighteen** poses touch a mechanism the note names.

## The three to raise first

**1. Standing Forward Fold, 60 seconds.** *Loaded* end-range flexion — gravity through the spine, not supported on the floor — held for a minute, with the cue *"upper body hangs heavy"* explicitly asking for passive end-range. It also puts the head below the heart, which is the hernia axis. It engages two of the three conditions at once, and is close to a verbatim description of what Full Body's note says to avoid.

**2. Swimming Side Stretch.** Eight repeated side-bends per side. Side-bending is one of the three movements named as closing the foramen, and this is the only pose that does it repetitively.

**3. The four sustained rotations** (two seated twists, two eagle twists). Rotation is also named. The seated pair are the more loaded of the four.

## Questions for the physio

1. Standing Forward Fold specifically — is loaded end-range flexion off the table, or acceptable with bent knees and a shorter hold?
2. Is sustained rotation (30s held) different from mid-range moving rotation like Windshield Wipers, for foraminal narrowing?
3. Does the hiatus hernia change anything about head-below-heart positions, beyond the existing timing advice?
4. Should this flow be re-tuned pose by pose, or replaced with a hips-focused sequence that doesn't lean on forward folds?

## What can be done without a clinical decision

The safety and timing guidance — 2–3h after eating, not within an hour of waking, no breath-holding, the stop signals and the red flags — **already exists in the app but renders only on Full Body**. Showing that same recorded text on `Hips & Lower Back` needs no clinical judgement: it is Cathal's own guidance applied to a session it equally covers, and it changes no pose. Not built; offered 05/09/2026 and not yet taken up.

## When Cathal has decided

Record the decision in `HEARTH-backlog.md` § TRAIN CONTENT, then a build session may: apply the chosen pose changes, fill the empty `YOGA_TRAIN_NOTES[1]` slot so the flow states its review status the way Full Body does, and remove the blanket `stenosis-safe.` guarantee from the Max Pilates Core bridge cue. Note `YOGA_TRAIN_NOTES` is **index-aligned** with `YOGA_FLOWS_TRAIN` (see `HEARTH-notes.md` § Train programme safety content, rule 2).
