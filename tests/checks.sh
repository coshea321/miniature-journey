#!/usr/bin/env bash
# Hearth mechanical checks — the single implementation.
#
# Run by BOTH the GitHub Action (.github/workflows/hearth-pr-checks.yml) and
# the hearth-verifier subagent. Before this existed the same checks were
# written twice, in two languages, maintained by hand — and they had already
# drifted (the doubling tripwire was 1.4x in CI and 1.25x in the verifier).
# If you are tempted to re-add a copy of a check somewhere else: don't.
#
# Usage:  tests/checks.sh [base-ref]        (default base: origin/main)
# Output: one line per check, plus ::error:: lines GitHub renders in the
#         Checks tab and a human can paste into a session.
# Exit:   0 = all passed, 1 = at least one failed.
#
# This script does NOT run the behaviour tests — `node tests/run.js` is a
# separate step in both callers, so a red test suite and a red mechanical
# check stay distinguishable at a glance.

set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
err() { echo "::error::$1"; fail=1; }
ok()  { echo "  ok   $1"; }

# Resolve the base to something `git show` can actually read. Locally that is
# usually `origin/main`; in CI, github.base_ref is the bare branch name and a
# PR checkout has no such local ref, so fall back to fetching it and using
# FETCH_HEAD. Getting this wrong silently skips the size and bump checks
# rather than failing loudly, so it resolves once here and is asserted below.
RAW_BASE="${1:-origin/main}"
if   git rev-parse --verify --quiet "${RAW_BASE}^{commit}" >/dev/null; then BASE_REF="$RAW_BASE"
elif git rev-parse --verify --quiet "origin/${RAW_BASE}^{commit}" >/dev/null; then BASE_REF="origin/$RAW_BASE"
elif git fetch --quiet --depth=1 origin "${RAW_BASE#origin/}" 2>/dev/null; then BASE_REF="FETCH_HEAD"
else BASE_REF="$RAW_BASE"; fi

echo "Hearth mechanical checks (base: $RAW_BASE -> $BASE_REF)"

# --- 1. Syntax-check the main inline script block --------------------------
# From the "// PREVIEW MODE" comment to the FIRST </script> AT OR AFTER it.
# NOT the first </script> in the file — the DOMPurify <script src> tag closes
# earlier and using it would extract nothing. The print-doc JS string builds a
# closing tag as the ESCAPED form <\/script>, which correctly does not match.
START=$(grep -n '// PREVIEW MODE' index.html | head -1 | cut -d: -f1)
if [ -z "${START}" ]; then
  err "'// PREVIEW MODE' marker not found in index.html"
else
  END=$(awk -v s="$START" 'NR>=s && /<\/script>/{print NR; exit}' index.html)
  sed -n "${START},$((END-1))p" index.html > /tmp/hearth-block.js
  if node --check /tmp/hearth-block.js; then
    ok "node --check (lines $START-$((END-1)))"
  else
    err "node --check failed on the main script block"
  fi
fi

# --- 2. File structure -----------------------------------------------------
[ "$(grep -ci '<!doctype' index.html)" = "2" ] \
  && ok "DOCTYPE count is 2 (one real + one in the print-doc string)" \
  || err "DOCTYPE count != 2 (expect one real + one in the print-doc string)"

[ "$(grep -c '<html lang' index.html)" = "1" ] \
  && ok "single <html lang" \
  || err "html-lang count != 1"

VCOUNT=$(grep -cE 'v[0-9]{3} · [0-9]{2}/[0-9]{2}/[0-9]{4}' index.html)
if [ "$VCOUNT" = "1" ]; then
  ok "exactly one version label in index.html"
else
  # No judgement calls here: a second match fails even when it is "only" a
  # comment or an example string (this exact miss shipped in v312). Real
  # version strings belong in code as the placeholder form vNNN · DD/MM/YYYY,
  # which does not match the regex.
  err "in-file version label count is $VCOUNT, expected 1 — matches on lines: $(grep -nE 'v[0-9]{3} · [0-9]{2}/[0-9]{2}/[0-9]{4}' index.html | cut -d: -f1 | tr '\n' ' ')"
fi

tail -c 40 index.html | tr -d '[:space:]' | grep -q '</body></html>$' \
  && ok "clean EOF (</body></html>)" \
  || err "index.html does not end cleanly with </body></html>"

# --- 3. Document-doubling tripwire ----------------------------------------
# A tripwire, not a size budget: the v221 incident duplicated the whole
# document in one edit. Measured as a RATIO against the base branch rather
# than a fixed ceiling, so this number never needs touching as the file grows.
BYTES=$(wc -c < index.html)
BASE_BYTES=$(git show "$BASE_REF:index.html" 2>/dev/null | wc -c)
if [ "$BASE_BYTES" -lt 1000 ]; then
  err "could not read index.html from $BASE_REF (got $BASE_BYTES bytes)"
elif [ "$BYTES" -lt "$(( BASE_BYTES * 14 / 10 ))" ]; then
  ok "size $BYTES bytes vs $BASE_BYTES on base (under 1.4x)"
else
  err "index.html is $BYTES bytes vs $BASE_BYTES on $BASE_REF (over 1.4x) - v221-style document doubling?"
fi

# --- 4. Version consistency and bump ---------------------------------------
SWV=$(grep -oE 'v[0-9]{3} · [0-9]{2}/[0-9]{2}/[0-9]{4}' sw.js | head -1)
HTMLV=$(grep -oE 'v[0-9]{3} · [0-9]{2}/[0-9]{2}/[0-9]{4}' index.html | head -1)
[ -n "$SWV" ] || err "no vNNN · DD/MM/YYYY version found in sw.js"
[ "$SWV" = "$HTMLV" ] \
  && ok "version matches across sw.js and index.html ($SWV)" \
  || err "version mismatch: sw.js '$SWV' vs index.html '$HTMLV'"

if git diff --quiet "$BASE_REF" -- index.html sw.js; then
  ok "app files unchanged vs $BASE_REF - bump check skipped"
else
  BASEV=$(git show "$BASE_REF:sw.js" | grep -oE 'v[0-9]{3}' | head -1)
  if [ "$((10#${SWV:1:3}))" -gt "$((10#${BASEV:1:3}))" ]; then
    ok "version bumped: $BASEV -> ${SWV%% *}"
  else
    err "index.html/sw.js changed but version not bumped ($BASEV -> ${SWV%% *})"
  fi
fi

# --- 5. Dosing literal pins ------------------------------------------------
# "Never silently change strengths or formulas" (CLAUDE.md), made mechanical.
# Any PR touching these goes red until the greps are deliberately updated.
dose_pin() { # <count-expr> <label>
  [ "$1" = "1" ] && ok "dosing pin: $2" || err "$2 changed unexpectedly"
}
dose_pin "$(grep -c "data-mgkg='15' data-mg5='120'" index.html)" "Calpol constants (15mg/kg, 120mg/5ml)"
dose_pin "$(grep -c "data-mgkg='10' data-mg5='100'" index.html)" "Nurofen constants (10mg/kg, 100mg/5ml)"
dose_pin "$(grep -c "data-floor='5'" index.html)"                "Nurofen under-5kg floor"
dose_pin "$(grep -cF 'Math.floor((w*mgkg*5/mg5)*4)/4' index.html)" "dose formula string"
[ "$(grep -c 'check the leaflet' index.html)" -ge "4" ] \
  && ok "dosing pin: 'check the leaflet' wording present (>=4)" \
  || err "'check the leaflet' safety wording count dropped below 4"

# --- 6. Duplicate top-level function names ---------------------------------
# A hoisting-shadowed duplicate is a silent no-op no test can see, but a grep
# can. The pre-existing workout-session duplicates were removed in v351 (all
# 24 pairs verified byte-identical first), so the allowlist is empty — ANY
# duplicate fails.
ALLOWLISTED_DUPES=""
DUPES=$(grep -oE '^function [A-Za-z0-9_]+' index.html | awk '{print $2}' | sort | uniq -d)
NEW_DUPES=""
for d in $DUPES; do
  case " $ALLOWLISTED_DUPES " in
    *" $d "*) ;;
    *) NEW_DUPES="$NEW_DUPES $d" ;;
  esac
done
[ -z "$NEW_DUPES" ] \
  && ok "no duplicate top-level function names" \
  || err "new duplicate function name(s) found (hoisting risk):$NEW_DUPES"

# --- 7. Known-quirk spot checks (WARN only) --------------------------------
# Context matters for these, so they never fail the build — they surface for
# a human to judge.
# var shadowing: ANCHOR TO COLUMN 0. `var name = ...` inside a function is an
# ordinary local and shadows nothing — the file has ~18 of them and every one
# is fine. Only a TOP-LEVEL `var history` shadows window.history. An unanchored
# grep here reports all 18 and trains everyone to ignore the check.
SHADOW=$(grep -nE '^var (history|location|name|status|frames|top|parent|self)\b' index.html)
[ -z "$SHADOW" ] \
  && ok "no top-level var shadowing a window global" \
  || echo "  WARN top-level var shadows a window global, lines: $(echo "$SHADOW" | cut -d: -f1 | tr '\n' ' ')"

# The print-doc JS string builds a closing tag as the ESCAPED form <\/script>.
# If that ever gets un-escaped, Chrome's parser closes the main script block
# early and the app blank-pages with no JS error. Assert the escaped form is
# still there rather than counting raw </script> occurrences — that count is
# just "however many script blocks exist today" (3 right now: the DOMPurify
# tag, the early inline block, and the main block) and would go stale the
# moment anyone adds or removes a block.
[ "$(grep -cF '<\/script>' index.html)" -ge 1 ] \
  && ok "print-doc close tag still escaped as <\\/script>" \
  || echo "  WARN no escaped <\\/script> found — if the print-doc string now closes with a literal tag, the app will blank-page. The boot smoke test is the real guard here."
echo "  note $(grep -c '</script>' index.html) literal </script> and $(grep -c '<script' index.html) <script occurrences (informational)"

# ── Piggyback fixes (HEARTH-backlog.md § Piggyback fixes) ────────────────────
# Verified stale lines too small to justify a version of their own. Each one
# below is a literal string that should no longer be in the file; while it is
# still there we print a note so every PR's Checks block carries the reminder,
# and the note disappears by itself once the line is fixed.
# INFORMATIONAL ONLY — never touch `fail`. These are corrections to make while
# you are already in the file, not a reason to block someone else's change.
# Adding one: append "<file>|<literal string>|<what to do>" to the list, and
# strike the item through in the backlog when it ships.
PIGGYBACK="index.html|Track hosts Log/Food/Body|add Medicine — it has been a Track sub-tab since v380
HEARTH-notes.md|~12,100 lines|delete the size parenthetical; CLAUDE.md says this file quotes no size"
while IFS='|' read -r pf ps pmsg; do
  [ -z "$pf" ] && continue
  if [ -f "$pf" ] && grep -qF "$ps" "$pf"; then
    echo "  note pending piggyback fix — $pf: $pmsg"
  fi
done <<EOF
$PIGGYBACK
EOF

echo
[ "$fail" = "0" ] && echo "MECHANICAL CHECKS: PASS" || echo "MECHANICAL CHECKS: FAIL"
exit $fail
