'use strict';

module.exports = {
  name: '05-merge-trips',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      var localTrips = [
        {id:1, name:'TripA', updated:100, bookings:[
          {id:103, title:'X', updated:100},                 // no 'seats' key -> field-fill test
          {id:104, title:'Y', updated:100, seats:''},        // explicit '' -> stays ''
          {id:105, title:'Old', updated:100}                 // newest-wins: incoming should win
        ]},
        {id:2, name:'TripB', updated:400, bookings:[
          {id:106, title:'Z', updated:400}                   // booking-level tombstone
        ]},
        {id:3, name:'TripC', updated:100, bookings:[]},       // push-flag: missing from incoming
        {id:4, name:'TripD', updated:400, bookings:[]}        // trip-level tombstone
      ];
      var incomingTrips = [
        {id:1, name:'TripA', updated:100, bookings:[
          {id:103, title:'X', updated:50, seats:'14A'},
          {id:104, title:'Y', updated:50, seats:'22B'},
          {id:105, title:'New', updated:200}
        ]},
        {id:2, name:'TripB', updated:400, bookings:[
          {id:106, title:'Z', updated:400}
        ]},
        {id:4, name:'TripD', updated:400, bookings:[]}
      ];
      var tripTombs = {4:500};
      var bookingTombs = {106:500};

      var result = mergeTripsData(localTrips, incomingTrips, tripTombs, bookingTombs);
      var tripA = result.trips.find(function(t){return t.id===1;});
      var b103 = tripA && tripA.bookings.find(function(b){return b.id===103;});
      var b104 = tripA && tripA.bookings.find(function(b){return b.id===104;});
      var b105 = tripA && tripA.bookings.find(function(b){return b.id===105;});

      ok('field-fill: winner missing seats gets loser value', b103 && b103.seats === '14A', 'got: ' + JSON.stringify(b103));
      ok('field-fill: winner explicit "" stays ""', b104 && b104.seats === '', 'got: ' + JSON.stringify(b104));
      ok('booking newest-wins', b105 && b105.title === 'New', 'got: ' + JSON.stringify(b105));

      var tripB = result.trips.find(function(t){return t.id===2;});
      ok('booking-level tombstone drops booking', tripB && tripB.bookings.length===0, 'got: ' + JSON.stringify(tripB));

      ok('trip-level tombstone drops trip', !result.trips.some(function(t){return t.id===4;}), 'got trips: ' + JSON.stringify(result.trips.map(function(t){return t.id;})));

      ok('push true when local has a trip incoming lacks', result.push === true, 'push=' + result.push);

      return {pass:pass, fail:fail};
    })()`);
    return result;
  },
};
