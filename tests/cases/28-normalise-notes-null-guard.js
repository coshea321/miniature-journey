'use strict';

// v388 — normaliseNotes() had no null guard (it read n.body/n.title straight
// off each entry), a known bug found while building v384's global search but
// deliberately NOT fixed there — global search's own globalSearchNotesPool()
// filtered raw nulls out BEFORE calling normaliseNotes() as a narrow local
// workaround, but every OTHER caller (the Notes section's own rendering,
// opening/highlighting a note, the Family Log aggregator) stayed exposed to
// the exact same crash class as the known fl4_recipebook null-entry bug.
//
// Fix is at the source, not the symptom: normaliseNotes() itself now filters
// nulls, so every reader gets clean data from one place — the same shape as
// the v385 getRecipeBook() fix. globalSearchNotesPool()'s now-redundant local
// workaround was simplified away rather than left as dead-weight duplication.

const GOOD_NOTE = { id: 1000, title: 'Wifi password', body: 'Guest network: hearth-guest', createdAt: 1000, updatedAt: 1000 };

module.exports = {
  name: '28-normalise-notes-null-guard',
  async run(page) {
    const pass = [];
    const fail = [];
    function check(name, ok, detail) {
      if (ok) pass.push(name);
      else fail.push({ name: name, detail: detail });
    }

    // ── normaliseNotes() itself ────────────────────────────────────────────
    const direct = await page.evaluate(
      '(function(){ return {' +
      'nullInput: normaliseNotes(null).length,' +
      'undefinedInput: normaliseNotes(undefined).length,' +
      'nullEntry: normaliseNotes([null, ' + JSON.stringify(GOOD_NOTE) + ']).length,' +
      'leadingNullEntry: normaliseNotes([null, null, ' + JSON.stringify(GOOD_NOTE) + ']).map(function(n){ return n.title; })' +
      '}; })()'
    );
    check('normaliseNotes(null) returns [] rather than throwing', direct.nullInput === 0, 'got: ' + direct.nullInput);
    check('normaliseNotes(undefined) returns [] rather than throwing', direct.undefinedInput === 0, 'got: ' + direct.undefinedInput);
    check('normaliseNotes() drops a null entry and keeps the good one', direct.nullEntry === 1, 'got: ' + direct.nullEntry);
    check(
      'normaliseNotes() survives multiple leading nulls (worst case for a naive filter)',
      direct.leadingNullEntry.length === 1 && direct.leadingNullEntry[0] === 'Wifi password',
      'got: ' + JSON.stringify(direct.leadingNullEntry)
    );

    // ── The Notes section's own rendering (renderNotesSection, via
    // currentList === "notes") survives a null entry in the active store ───
    const notesUi = await page.evaluate(
      '(function(){ storeSet("fl4_notes_global", [null, ' + JSON.stringify(GOOD_NOTE) + ']);' +
      'currentNotesView = "personal";' +
      'try { openRecord("notes", null, { ctx: "personal" }); return { ok:true, text: document.getElementById("notesPersonalView").innerText }; }' +
      'catch (e) { return { ok:false, err: e.message }; } })()'
    );
    check('the Notes section renders with a null entry present', notesUi.ok, notesUi.err);
    check('the good note still shows up alongside the null', notesUi.ok && notesUi.text.indexOf('Wifi password') !== -1, 'note missing from output');

    // ── openNoteById / toggleNoteHighlightById also call normaliseNotes()
    // directly on the raw store — must not throw with a null present ──────
    const openResult = await page.evaluate(
      '(function(){ storeSet("fl4_notes_global", [null, ' + JSON.stringify(GOOD_NOTE) + ']);' +
      'currentNotesView = "personal";' +
      'try { openNoteById(1000); return "ok"; } catch (e) { return "threw: " + e.message; } })()'
    );
    check('openNoteById() survives a null entry in the store', openResult === 'ok', openResult);

    const highlightResult = await page.evaluate(
      '(function(){ storeSet("fl4_notes_global", [null, ' + JSON.stringify(GOOD_NOTE) + ']);' +
      'currentNotesView = "personal";' +
      'try { toggleNoteHighlightById(1000); return "ok"; } catch (e) { return "threw: " + e.message; } })()'
    );
    check('toggleNoteHighlightById() survives a null entry in the store', highlightResult === 'ok', highlightResult);

    // ── Family Log's event aggregator also calls normaliseNotes() directly
    // on both note stores — must not throw with a null present in either ───
    const famlogResult = await page.evaluate(
      '(function(){ storeSet("fl4_notes_global", [null, ' + JSON.stringify(GOOD_NOTE) + ']);' +
      'storeSet("fl4_notes_global_work", [null]);' +
      'try { renderFamlog(); return "ok"; } catch (e) { return "threw: " + e.message; } })()'
    );
    check('the Family Log aggregator survives a null entry in either notes store', famlogResult === 'ok', famlogResult);

    // Reset for any later case file sharing this page.
    await page.evaluate(
      '(function(){ storeSet("fl4_notes_global", [' + JSON.stringify(GOOD_NOTE) + ']);' +
      'storeSet("fl4_notes_global_work", []); return true; })()'
    );

    return { pass, fail };
  },
};
