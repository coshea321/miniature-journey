'use strict';

// v443: the home screen's calories card. `homeCalState()` is the whole of its
// logic, so it is pinned here rather than through the DOM.
//
// The two rules that make it "gentle" and that a later refactor could quietly
// undo:
//   * being UNDER pace is never a warning — there is no fourth "behind" state,
//     because eating less than planned is not something to nag about; and
//   * the band is wide (a fifth of the goal, floor 300), so a normal breakfast
//     early in the window reads as on-track, not as "ahead".
// It also reads fl4_cal_goal, NOT the TDEE card's computed goal — so the card
// works before any height/weight/profile has been set up.

module.exports = {
  name: '54-home-calories-card',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      var today = trainTodayStr();
      var _realDate = Date;

      // Freeze the clock at a given hour so the pace maths is deterministic.
      function atHour(h, m){
        var fixed = new _realDate();
        fixed.setHours(h, m || 0, 0, 0);
        window.Date = function(){ return new _realDate(fixed.getTime()); };
        window.Date.now = function(){ return fixed.getTime(); };
        window.Date.prototype = _realDate.prototype;
      }
      function realClock(){ window.Date = _realDate; }

      function setDay(entries){
        storeSet("fl4_food_log", entries.map(function(e, i){
          return { id: 9000 + i, date: today, meal: e.meal || 0, text: e.text || "x", cal: e.cal, calAuto: false };
        }));
      }

      storeSet("fl4_cal_goal", 2000);

      // ── Hides itself when nothing is logged today ────────────────────────
      storeSet("fl4_food_log", []);
      ok('null when nothing logged today', homeCalState() === null, 'got: ' + JSON.stringify(homeCalState()));

      storeSet("fl4_food_log", [{ id:1, date:"2020-01-01", meal:0, text:"old", cal:500 }]);
      ok('null when the only entries are on another day',
         homeCalState() === null, 'got: ' + JSON.stringify(homeCalState()));

      // ── Totals and the arithmetic on the card face ───────────────────────
      atHour(13);
      setDay([{ cal:320 }, { cal:450 }]);
      var s = homeCalState();
      ok('totals today only', s.eaten === 770, 'got: ' + s.eaten);
      ok('goal read from fl4_cal_goal', s.goal === 2000, 'got: ' + s.goal);
      ok('left = goal - eaten', s.left === 1230, 'got: ' + s.left);
      ok('pct is eaten/goal', s.pct === 39, 'got: ' + s.pct);

      // ── On track: at 1pm, pace expects 857 of 2000, band is 400 ──────────
      ok('at 1pm, 770 eaten is on track', s.state === "ontrack", 'got: ' + s.state);

      // ── Ahead of pace, but still under the goal ──────────────────────────
      atHour(9);                                  // pace = 120/840 -> expects ~286
      setDay([{ cal:1200 }]);
      ok('at 9am, 1200 eaten is ahead of pace', homeCalState().state === "ahead",
         'got: ' + homeCalState().state);
      ok('ahead is still under the goal, so left stays positive',
         homeCalState().left === 800, 'got: ' + homeCalState().left);

      // ── Over the goal beats everything, at any hour ──────────────────────
      atHour(20);
      setDay([{ cal:2300 }]);
      var over = homeCalState();
      ok('over the goal reports over', over.state === "over", 'got: ' + over.state);
      ok('over reports a negative left, for the card to flip', over.left === -300, 'got: ' + over.left);
      ok('pct clamps at 100 when over', over.pct === 100, 'got: ' + over.pct);

      // ── TRIPWIRE: under pace is never flagged ────────────────────────────
      // Late in the day on almost nothing eaten is the case a "behind" state
      // would nag about. There must not be one.
      atHour(21);
      setDay([{ cal:200 }]);
      ok('TRIPWIRE far under pace late in the day is still on track',
         homeCalState().state === "ontrack", 'got: ' + homeCalState().state);

      // ── The band keeps an ordinary breakfast quiet ───────────────────────
      atHour(7, 30);                              // pace ~ 30/840, expects ~71
      setDay([{ cal:320 }]);
      ok('a 320 kcal breakfast at 7:30 is on track, not ahead',
         homeCalState().state === "ontrack", 'got: ' + homeCalState().state);

      // ── Band floors at 300 for a small goal ──────────────────────────────
      storeSet("fl4_cal_goal", 1200);             // a fifth is 240, so the floor bites
      atHour(7, 0);                               // pace 0, expects 0
      setDay([{ cal:280 }]);
      ok('band floors at 300, so 280 at 7am is on track on a 1200 goal',
         homeCalState().state === "ontrack", 'got: ' + homeCalState().state);
      setDay([{ cal:400 }]);
      ok('past the 300 floor it does report ahead',
         homeCalState().state === "ahead", 'got: ' + homeCalState().state);

      // ── Falls back to 2000 with no goal stored ───────────────────────────
      localStorage.removeItem("fl4_cal_goal");
      atHour(13);
      setDay([{ cal:500 }]);
      ok('no stored goal falls back to 2000', homeCalState().goal === 2000,
         'got: ' + homeCalState().goal);

      realClock();
      storeSet("fl4_food_log", []);
      localStorage.removeItem("fl4_cal_goal");
      return {pass:pass, fail:fail};
    })()`);
    return result;
  },
};
