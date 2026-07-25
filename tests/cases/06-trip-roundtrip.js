'use strict';

module.exports = {
  name: '06-trip-roundtrip',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      // The 11 booking fields documented in CLAUDE.md's trip data model, plus
      // 'id' (regenerated) and 'updated' (set to now) which are intentionally
      // excluded from the export/import round-trip.
      var fixture = {
        hearth: 'trip-v1',
        name: 'RoundtripTestTrip',
        start: '2026-08-01',
        end: '2026-08-10',
        bookings: [{
          type: 'flight', title: 'Outbound', start: '2026-08-01T09:00', end: '2026-08-01T12:00',
          location: 'DUB', ref: 'ABC123', notes: 'window seat',
          connectsFrom: true, boarding: '08:15', gate: 'A12', seats: '14A'
        }]
      };

      var res = importTripFromJSON(JSON.stringify(fixture));
      ok('importTripFromJSON returns an id', res && res.id != null, 'got: ' + JSON.stringify(res));

      var trips = getTrips();
      var trip = trips.find(function(t){ return t.id === res.id; });
      ok('imported trip found in store', !!trip, 'trips: ' + JSON.stringify(trips.map(function(t){return t.id;})));

      var b = trip && trip.bookings[0];
      var fields = ['type','title','start','end','location','ref','notes','connectsFrom','boarding','gate','seats'];
      var allMatch = b && fields.every(function(f){ return JSON.stringify(b[f]) === JSON.stringify(fixture.bookings[0][f]); });
      ok('all 11 booking fields land intact on import', allMatch, 'got: ' + JSON.stringify(b));

      // mergeBookingsIntoTrip: adding a booking to the same trip carries the
      // same 11 fields through its own construction path.
      var mergeRes = mergeBookingsIntoTrip(res.id, [fixture.bookings[0]]);
      ok('mergeBookingsIntoTrip returns the trip id', mergeRes && mergeRes.id === res.id, 'got: ' + JSON.stringify(mergeRes));
      var trip2 = getTrips().find(function(t){ return t.id === res.id; });
      var b2 = trip2 && trip2.bookings[trip2.bookings.length - 1];
      var allMatch2 = b2 && fields.every(function(f){ return JSON.stringify(b2[f]) === JSON.stringify(fixture.bookings[0][f]); });
      ok('all 11 booking fields land intact via mergeBookingsIntoTrip', allMatch2, 'got: ' + JSON.stringify(b2));

      // Error paths
      var errBadJson = importTripFromJSON('not json');
      ok('bad JSON returns an error', !!(errBadJson && errBadJson.error), 'got: ' + JSON.stringify(errBadJson));

      var errNoTag = importTripFromJSON(JSON.stringify({name:'X'}));
      ok('missing hearth tag returns an error', !!(errNoTag && errNoTag.error), 'got: ' + JSON.stringify(errNoTag));

      var errNoName = importTripFromJSON(JSON.stringify({hearth:'trip-v1'}));
      ok('missing name returns an error', !!(errNoName && errNoName.error), 'got: ' + JSON.stringify(errNoName));

      // Clean up the imported trip so it doesn't linger in this case's state.
      var remaining = getTrips().filter(function(t){ return t.id !== res.id; });
      saveTripsStore(remaining);
      ok('cleanup: imported trip removed', !getTrips().some(function(t){return t.id===res.id;}), 'trips: ' + JSON.stringify(getTrips().map(function(t){return t.id;})));

      return {pass:pass, fail:fail};
    })()`);
    return result;
  },
};
