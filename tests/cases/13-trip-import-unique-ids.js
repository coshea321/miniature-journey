'use strict';

module.exports = {
  name: '13-trip-import-unique-ids',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      function allUnique(ids) {
        var seen = {};
        for (var i = 0; i < ids.length; i++) {
          if (seen[ids[i]]) return false;
          seen[ids[i]] = true;
        }
        return true;
      }

      // Fix-queue batch F, finding 10: importTripFromJSON and
      // mergeBookingsIntoTrip used to capture Date.now() once for the whole
      // booking loop, so a single import/merge could give two bookings the
      // same id (the merge AND tombstone key). Pin large single-call batches
      // — well above the 12-booking case that reproduced the collision
      // empirically in the bug review — all unique within that call.
      var N = 500;
      var bookings = [];
      for (var i = 0; i < N; i++) {
        bookings.push({ type: 'other', title: 'Booking ' + i, start: '2026-08-0' + (1 + (i % 9)) });
      }
      var fixture = { hearth: 'trip-v1', name: 'UniqueIdTestTrip', bookings: bookings };
      var res = importTripFromJSON(JSON.stringify(fixture));
      ok('importTripFromJSON returns an id', res && res.id != null, 'got: ' + JSON.stringify(res));

      var trip = getTrips().find(function(t){ return t.id === res.id; });
      ok('imported trip found', !!trip, 'trips: ' + JSON.stringify(getTrips().map(function(t){return t.id;})));
      ok('all ' + N + ' bookings present', trip && trip.bookings.length === N, 'got: ' + (trip && trip.bookings.length));
      var ids = trip ? trip.bookings.map(function(b){ return b.id; }) : [];
      ok('all imported booking ids unique', allUnique(ids), 'dup found in: ' + JSON.stringify(ids));

      // mergeBookingsIntoTrip's own booking-construction loop has the same
      // fix applied independently — pin uniqueness within its own batch too.
      var trip2 = { id: Date.now() + 999999, name: 'MergeUniqueIdTestTrip', bookings: [] };
      var trips = getTrips();
      trips.unshift(trip2);
      saveTripsStore(trips);
      var mergeRes = mergeBookingsIntoTrip(trip2.id, bookings);
      ok('mergeBookingsIntoTrip returns the trip id', mergeRes && mergeRes.id === trip2.id, 'got: ' + JSON.stringify(mergeRes));
      var trip2After = getTrips().find(function(t){ return t.id === trip2.id; });
      var mergedIds = trip2After ? trip2After.bookings.map(function(b){ return b.id; }) : [];
      ok('all ' + N + ' merged bookings present', trip2After && trip2After.bookings.length === N, 'got: ' + (trip2After && trip2After.bookings.length));
      ok('all merged booking ids unique within the merge batch', allUnique(mergedIds), 'dup found in: ' + JSON.stringify(mergedIds));

      // Clean up so this case's state doesn't linger.
      var remaining = getTrips().filter(function(t){ return t.id !== res.id && t.id !== trip2.id; });
      saveTripsStore(remaining);
      ok('cleanup: both test trips removed', !getTrips().some(function(t){return t.id===res.id || t.id===trip2.id;}), 'trips: ' + JSON.stringify(getTrips().map(function(t){return t.id;})));

      return {pass:pass, fail:fail};
    })()`);
    return result;
  },
};
