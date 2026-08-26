'use strict';

// v439 — TDEE, the weight-loss goal, and the daily calorie target.
//
// What's worth pinning:
//   1. TRAINING CALORIES ARE NEVER ADDED. This is the whole safety of the
//      feature: a weight-derived TDEE already contains every workout that
//      helped cause the weight change, so adding the Train kcal on top
//      double-counts them and inflates the goal by hundreds of kcal. The
//      tripwire below logs a huge session and asserts NOTHING moves. If it
//      ever fails, do not "fix" the test — someone has added exercise back
//      into the sum.
//   2. the formula is Mifflin-St Jeor exactly, x the activity multiplier
//   3. the measured figure is mean intake minus the regression slope of the
//      weight trend x 7700, and it uses a least-squares fit rather than
//      first-minus-last, so one water-weight morning can't swing it
//   4. the gates: two weights 14+ days apart, and food logged on ~80% of the
//      days in between. A missing food day is MISSING, never a zero.
//   5. the crossfade: formula alone at 14 days, measured alone at 28
//   6. the two guards on the goal — the 1500 kcal floor and the 25%-of-TDEE
//      deficit cap — and that a goal is never set ABOVE the burn
//   7. an implausible measured figure falls back to the formula instead of
//      presenting a data glitch as a metabolism
//   8. the profile rides both sync channels and the backup file

module.exports = {
  name: '49-tdee',
  async run(page) {
    return await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function near(a, b, tol){ return Math.abs(a - b) <= (tol || 1); }

      function dayStr(off){
        var d = new Date(); d.setDate(d.getDate() + off);
        return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth()+1) + '-' + (d.getDate() < 10 ? '0' : '') + d.getDate();
      }
      // A perfectly straight 2 kg loss over 28 days of daily weigh-ins:
      // slope -0.0714 kg/day, which is exactly a 550 kcal/day shortfall.
      function straightWeights(){
        var out = [];
        for (var i = 0; i <= 28; i++) out.push({ date: dayStr(-i), weight: 80 + (i / 28) * 2 });
        return out;
      }
      function foodEvery(days, kcal){
        var out = [];
        for (var i = 0; i <= days; i++) out.push({ id: 4900+i, date: dayStr(-i), meal: 0, text: 'Test day', cal: kcal });
        return out;
      }
      function setUp(profile, weights, food){
        storeSet('fl4_workouts', { workouts: [], bodyweight: weights || [] });
        storeSet('fl4_food_log', food || []);
        storeSet('fl4_action_log', []);
        storeSet('fl4_profile', profile || {});
      }
      var P = { sex:'m', heightCm:180, birthYear:1990, activity:1.375, rate:0.5, goalKg:0 };
      var age = new Date().getFullYear() - 1990;
      var expBmr = Math.round(10*80 + 6.25*180 - 5*age + 5);
      var expFormula = Math.round(expBmr * 1.375);

      // ── 1. The formula ──────────────────────────────────────────────────
      setUp(P, [{ date: dayStr(0), weight: 80 }], []);
      ok('Mifflin-St Jeor is computed exactly', bmrMifflin(getProfile(), 80) === expBmr,
        String(bmrMifflin(getProfile(), 80)) + ' vs ' + expBmr);
      ok('the female constant is the other branch of the same formula',
        bmrMifflin({sex:'f',heightCm:180,birthYear:1990,activity:1.375}, 80) === expBmr - 166,
        String(bmrMifflin({sex:'f',heightCm:180,birthYear:1990,activity:1.375}, 80)));
      ok('TDEE is the BMR times the activity multiplier', formulaTDEE(getProfile(), 80) === expFormula,
        String(formulaTDEE(getProfile(), 80)));
      ok('with one weight and a profile the card runs on the formula',
        blendedTDEE().source === 'formula' && blendedTDEE().tdee === expFormula, JSON.stringify(blendedTDEE()));

      // An incomplete profile is not quietly filled with defaults.
      setUp({ sex:'m', heightCm:180 }, [{ date: dayStr(0), weight: 80 }], []);
      ok('an incomplete profile yields no formula', !profileComplete() && formulaTDEE(getProfile(), 80) === 0,
        JSON.stringify(getProfile()));
      ok('and with no measured figure either, there is no TDEE at all', blendedTDEE().ok === false, JSON.stringify(blendedTDEE()));

      // No logged weight must not fall back to the 70 kg cardio default.
      setUp(P, [], []);
      ok('no logged weight means no TDEE, not a TDEE built on a guessed 70 kg',
        tdeeCurrentKg() === 0 && blendedTDEE().ok === false, String(tdeeCurrentKg()));

      // ── 2. The measured figure ──────────────────────────────────────────
      setUp(P, straightWeights(), foodEvery(28, 2000));
      var m = measuredTDEE();
      ok('a full window of logs produces a measured figure', m.ok === true, JSON.stringify(m));
      ok('it is mean intake plus the shortfall the weight loss implies (2000 + 550)',
        near(m.tdee, 2550, 1), String(m.tdee));
      ok('it reports the trend it read', near(m.kgPerWeek, -0.5, 0.01), String(m.kgPerWeek));
      ok('and the intake it averaged', m.intake === 2000, String(m.intake));
      ok('at a 28-day span the measured figure is used alone',
        blendedTDEE().source === 'measured' && near(blendedTDEE().tdee, 2550, 1), JSON.stringify(blendedTDEE()));

      // Gaining runs through the same line with the sign flipped.
      setUp(P, straightWeights().map(function(w){ return { date: w.date, weight: 164 - w.weight }; }), foodEvery(28, 2000));
      ok('gaining weight subtracts the surplus instead of adding a shortfall',
        near(measuredTDEE().tdee, 1450, 1), String(measuredTDEE().tdee));

      // One bad morning must not swing the answer — that is why it regresses
      // instead of taking first-minus-last. Worst case for the naive version
      // is a spike on the NEWEST reading, so that is what this uses.
      var noisy = straightWeights();
      noisy[0].weight = 81.4;   // +1.4 kg of water on this morning's scale
      setUp(P, noisy, foodEvery(28, 2000));
      var fit = measuredTDEE().tdee;
      // What first-minus-last would have concluded from the same readings.
      var naive = Math.round(2000 + ((82.0 - 81.4) / 28) * 7700);
      ok('a least-squares fit rides out one odd reading', near(fit, 2550, 100), String(fit));
      ok('and is markedly closer to the truth than first-minus-last would be',
        Math.abs(fit - 2550) < Math.abs(naive - 2550) / 2,
        'fit ' + String(fit) + ' vs naive ' + String(naive));

      // ── 3. THE TRIPWIRE: training calories are never in the sum ─────────
      setUp(P, straightWeights(), foodEvery(28, 2000));
      var beforeTdee = blendedTDEE().tdee, beforeGoal = tdeeGoal().goal;
      var wd = getWD();
      wd.workouts = [{ id: 4991, date: dayStr(0), kcal: 900, exercises: [] }];
      storeSet('fl4_workouts', wd);
      storeSet('fl4_action_log', [{ id: 4992, date: dayStr(0), type: 'cardio', activity: 'Run', duration: 60, calories: 600 }]);
      ok('a 1,500 kcal training day is counted for display', tdeeTrainingToday() === 1500, String(tdeeTrainingToday()));
      ok('TRIPWIRE: logging training does NOT raise the measured TDEE',
        blendedTDEE().tdee === beforeTdee, String(blendedTDEE().tdee) + ' was ' + String(beforeTdee));
      ok('TRIPWIRE: logging training does NOT raise the daily food goal',
        tdeeGoal().goal === beforeGoal, String(tdeeGoal().goal) + ' was ' + String(beforeGoal));

      // Same tripwire on the formula-only path.
      setUp(P, [{ date: dayStr(0), weight: 80 }], []);
      var fOnly = blendedTDEE().tdee;
      storeSet('fl4_action_log', [{ id: 4993, date: dayStr(0), type: 'cardio', activity: 'Run', duration: 90, calories: 800 }]);
      ok('TRIPWIRE: training does not move the formula estimate either',
        blendedTDEE().tdee === fOnly, String(blendedTDEE().tdee) + ' was ' + String(fOnly));

      // ── 4. The gates ────────────────────────────────────────────────────
      setUp(P, [{ date: dayStr(0), weight: 80 }], foodEvery(28, 2000));
      ok('one weight reading is not a trend', measuredTDEE().reason === 'weights', JSON.stringify(measuredTDEE()));
      setUp(P, [{ date: dayStr(0), weight: 80 }, { date: dayStr(-10), weight: 81 }], foodEvery(28, 2000));
      ok('a span under 14 days is refused, and says how far along it is',
        measuredTDEE().reason === 'span' && measuredTDEE().days === 10, JSON.stringify(measuredTDEE()));

      // A missing food day is missing, never a zero-calorie day.
      var sparse = foodEvery(28, 2000).filter(function(e, i){ return i % 3 !== 0; });   // ~67% coverage
      setUp(P, straightWeights(), sparse);
      var gated = measuredTDEE();
      ok('patchy food logging is refused rather than averaged as zeroes',
        gated.ok === false && gated.reason === 'food', JSON.stringify(gated));
      ok('and the refusal says how many days were logged', gated.logged > 0 && gated.spanDays === 29,
        JSON.stringify(gated));
      ok('a gated measured figure falls back to the formula, not to nothing',
        blendedTDEE().ok === true && blendedTDEE().source === 'formula', JSON.stringify(blendedTDEE()));
      ok('and the card explains what is missing in plain words',
        /Food logged on/.test(tdeeMeasuredWait(gated)), tdeeMeasuredWait(gated));

      // ── 5. The crossfade ────────────────────────────────────────────────
      function spanOf(days){
        var w = [];
        for (var i = 0; i <= days; i += 7) w.push({ date: dayStr(-i), weight: 80 + (i / 28) * 2 });
        return w;
      }
      setUp(P, spanOf(14), foodEvery(28, 2000));
      var b14 = blendedTDEE();
      ok('at exactly 14 days the measured figure carries no weight yet',
        b14.weight === 0 && b14.source === 'formula' && b14.tdee === expFormula, JSON.stringify(b14));
      setUp(P, spanOf(21), foodEvery(28, 2000));
      var b21 = blendedTDEE();
      ok('at 21 days it is a half-and-half blend', near(b21.weight, 0.5, 0.001) && b21.source === 'blend', JSON.stringify(b21));
      ok('and the blended number sits between the two', near(b21.tdee, Math.round((expFormula + b21.measured.tdee) / 2), 1),
        String(b21.tdee) + ' between ' + String(expFormula) + ' and ' + String(b21.measured.tdee));
      setUp(P, spanOf(28), foodEvery(28, 2000));
      ok('at 28 days the formula is out of it entirely', blendedTDEE().weight === 1, JSON.stringify(blendedTDEE()));

      // ── 6. The goal, and its two guards ─────────────────────────────────
      setUp(P, straightWeights(), foodEvery(28, 2000));
      var g = tdeeGoal();
      ok('0.5 kg/week is a 550 kcal deficit', near(g.deficit, 550, 1), String(g.deficit));
      ok('the goal is the burn minus that deficit', near(g.goal, g.tdee - g.deficit, 1), JSON.stringify(g));
      ok('nothing is capped at a sensible rate', g.capped === '', g.capped);
      ok('the rate it will actually deliver is reported back', near(g.actualRate, 0.5, 0.01), String(g.actualRate));

      storeSet('fl4_profile', Object.assign(getProfile(), { rate: 0 }));
      ok('the maintain setting is a zero deficit, not a token one',
        tdeeGoal().deficit === 0 && tdeeGoal().goal === tdeeGoal().tdee, JSON.stringify(tdeeGoal()));

      storeSet('fl4_profile', Object.assign(getProfile(), { rate: 0.75 }));
      var steep = tdeeGoal();
      ok('a deficit over a quarter of the burn is capped', steep.capped === 'pct', JSON.stringify(steep));
      ok('and the cap is honoured, not just reported',
        steep.deficit <= Math.ceil(steep.tdee * 0.25), String(steep.deficit) + ' vs ' + String(steep.tdee * 0.25));
      ok('the reported rate drops to the one the cap allows', steep.actualRate < 0.75, String(steep.actualRate));

      // A low burn: the floor bites, and the goal must never exceed the burn.
      setUp({ sex:'f', heightCm:150, birthYear:1956, activity:1.2, rate:0.5, goalKg:0 }, [{ date: dayStr(0), weight: 45 }], []);
      var low = tdeeGoal();
      ok('a burn under the floor produces a maintenance goal, never a higher one',
        low.goal <= low.tdee && low.capped === 'floor', JSON.stringify(low));
      ok('and no phantom deficit is invented', low.deficit === low.tdee - low.goal && low.deficit >= 0, JSON.stringify(low));

      // Floor with a mid burn: 1250 intake on the same trend gives ~1800.
      setUp(Object.assign({}, P, { rate: 0.75 }), straightWeights(), foodEvery(28, 1250));
      var mid = tdeeGoal();
      ok('the 1500 kcal floor holds even when the percentage cap would allow less',
        mid.goal === 1500 && mid.capped === 'floor', JSON.stringify(mid));

      // ── 7. A glitch is not a metabolism ─────────────────────────────────
      setUp(P, straightWeights(), foodEvery(28, 5900));
      ok('an absurd measured figure is refused', measuredTDEE().reason === 'implausible', JSON.stringify(measuredTDEE()));
      ok('and the formula takes over rather than showing the glitch',
        blendedTDEE().source === 'formula' && blendedTDEE().tdee === expFormula, JSON.stringify(blendedTDEE()));

      // ── 8. Target date, only ever a projection ──────────────────────────
      setUp(Object.assign({}, P, { goalKg: 76 }), straightWeights(), foodEvery(28, 2000));
      var t = tdeeTargetDate(tdeeGoal());
      ok('a target weight gives a projected date', !!t && t.weeks === 8, JSON.stringify(t));
      ok('and says how much is left', near(t.toLose, 4, 0.01), String(t.toLose));
      storeSet('fl4_profile', Object.assign(getProfile(), { goalKg: 90 }));
      ok('a target above the current weight projects nothing', tdeeTargetDate(tdeeGoal()) === null, 'projected anyway');
      storeSet('fl4_profile', Object.assign(getProfile(), { goalKg: 76, rate: 0 }));
      ok('and neither does maintaining', tdeeTargetDate(tdeeGoal()) === null, 'projected on a zero rate');

      // ── 9. The profile travels ──────────────────────────────────────────
      setUp(P, straightWeights(), foodEvery(28, 2000));
      var payload = buildExportPayload();
      ok('the profile is in the backup payload', payload.profile && payload.profile.heightCm === 180,
        JSON.stringify(payload.profile));
      storeSet('fl4_profile', null);
      importBackupData(payload);
      ok('and comes back off a restore', getProfile().heightCm === 180 && getProfile().sex === 'm',
        JSON.stringify(getProfile()));

      // ── 10. The card renders both states without throwing ───────────────
      setUp(P, straightWeights(), foodEvery(28, 2000));
      // Start the food journal on a DIFFERENT goal, or the button under test
      // is correctly hidden because there is nothing to change.
      storeSet('fl4_cal_goal', 2500);
      switchSection('train');
      renderTdeeCard();
      var card = document.getElementById('tdeeCard');
      ok('the card draws with a burn and a goal', /kcal burned per day/.test(card.textContent) && /kcal to eat per day/.test(card.textContent),
        card.textContent.slice(0, 200));
      ok('it says the numbers are measured, not estimated', /Measured from 28 days/.test(card.textContent),
        card.textContent.slice(0, 300));
      ok('it offers to set the food journal goal', !!document.getElementById('tdeeApply'), 'no apply button');
      document.getElementById('tdeeApply').click();
      ok('applying writes the food journal goal', storeGet('fl4_cal_goal') === tdeeGoal().goal,
        String(storeGet('fl4_cal_goal')) + ' vs ' + String(tdeeGoal().goal));
      ok('and the button gives way to a confirmation', !document.getElementById('tdeeApply'), 'button still offered');

      storeSet('fl4_action_log', [{ id: 4994, date: dayStr(0), type: 'cardio', activity: 'Run', duration: 60, calories: 600 }]);
      renderTdeeCard();
      ok('a training day is shown with the do-not-eat-it-back warning',
        /don/.test(card.textContent) && /eat it back/.test(card.textContent), card.textContent.slice(-260));

      setUp({}, [], []);
      renderTdeeCard();
      ok('with nothing logged the card asks for what it needs instead of showing a number',
        /log today/.test(card.textContent) && !/kcal burned per day/.test(card.textContent),
        card.textContent.slice(0, 200));
      ok('and offers the set-up button', !!document.getElementById('tdeeEdit'), 'no set-up button');

      return {pass:pass, fail:fail};
    })()`);
  },
};
