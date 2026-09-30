'use strict';

// Projects (v499). The parts a bug would make quiet rather than loud: the
// two-level sync merge (a tick on one phone must not undo a quote added on
// the other), Firebase's missing/object-shaped `items`, item tombstones, the
// one-way To-do copy, the Home line's status filter, the backup round trip,
// the link gate at render, and the section being reachable at all.
// Cleans up after itself so later cases see an empty store.
module.exports = {
  name: '85-projects',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function day(off){ var d = new Date(); d.setDate(d.getDate() + off);
        function p(n){ return n < 10 ? '0' + n : '' + n; }
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
      function item(id, type, title, extra){
        var o = { id:id, type:type, title:title, date:'', amount:'', who:'', phone:'', url:'', notes:'', done:false, sentAt:0, updated:1000 };
        Object.keys(extra || {}).forEach(function(k){ o[k] = extra[k]; });
        return o;
      }
      var saved = storeGet('fl4_projects'), savedT = storeGet('fl4_tomb_projects'), savedI = storeGet('fl4_tomb_projitems');
      var savedTodo = JSON.parse(JSON.stringify(loadListData('todo')));

      // ── Fixed status set ─────────────────────────────────────────────────
      ok('the four confirmed statuses, in order',
        PROJ_STATUSES.map(function(s){ return s.label; }).join('|') === 'Idea|Planning|In progress|Done',
        PROJ_STATUSES.map(function(s){ return s.label; }).join('|'));
      ok('an unknown status reads as Planning', projStatusMeta('someday-maybe').key === 'planning');

      // ── The two-level merge ──────────────────────────────────────────────
      // Phone A ticked the task (item stamp 2000); phone B, at the same time,
      // added a quote. Neither project stamp moved.
      var A = [{ id:1, name:'Kitchen', status:'active', target:'', notes:'', updated:1000,
                 items:[ item(11, 'task', 'Measure', { done:true, updated:2000 }) ] }];
      var B = [{ id:1, name:'Kitchen', status:'active', target:'', notes:'', updated:1000,
                 items:[ item(11, 'task', 'Measure'), item(12, 'quote', 'Worktops', { amount:1850, updated:2100 }) ] }];
      var m = mergeProjectsData(A, B, {}, {});
      var k = m.projects[0];
      ok('a tick on one phone survives a quote added on the other',
        projFind(k.items, 11) && projFind(k.items, 11).done === true, JSON.stringify(k.items));
      ok('and the quote survives the tick', !!projFind(k.items, 12));
      ok('the newer local tick asks for a converge push', m.push === true);

      // Project fields newest-wins by the PROJECT stamp, items untouched by it.
      var m2 = mergeProjectsData(
        [{ id:1, name:'Old name', status:'planning', updated:1000, items:[ item(11, 'task', 'Measure', { done:true, updated:3000 }) ] }],
        [{ id:1, name:'New name', status:'active',   updated:2000, items:[ item(11, 'task', 'Measure', { updated:1000 }) ] }], {}, {});
      ok('a newer project rename wins', m2.projects[0].name === 'New name' && m2.projects[0].status === 'active');
      ok('while the older project keeps its newer item tick', projFind(m2.projects[0].items, 11).done === true);

      // Firebase drops an empty items:[] and returns sparse arrays as objects.
      var m3 = mergeProjectsData([{ id:2, name:'Shed', status:'idea', updated:1000, items:[ item(21, 'task', 'Sizes') ] }],
                                 [{ id:2, name:'Shed', status:'idea', updated:1000 }], {}, {});
      ok('an incoming project with no items key keeps the local items', m3.projects[0].items.length === 1);
      ok('items arriving as an object are read as an array',
        projItemsOf({ items:{ '0': item(31, 'task', 'x'), '2': item(32, 'link', 'y') } }).length === 2);
      ok('a missing items key reads as []', Array.isArray(projItemsOf({})) && projItemsOf({}).length === 0);

      // Item tombstones remove an item from both a known and a brand-new project.
      var m4 = mergeProjectsData([{ id:1, name:'K', updated:1000, items:[ item(11, 'task', 'a'), item(12, 'task', 'b') ] }],
                                 [{ id:1, name:'K', updated:1000, items:[ item(11, 'task', 'a'), item(12, 'task', 'b') ] },
                                  { id:3, name:'New', updated:1000, items:[ item(33, 'task', 'c') ] }],
                                 {}, { 12:5000, 33:5000 });
      ok('an item tombstone removes it from a known project', !projFind(projFind(m4.projects, 1).items, 12));
      ok('and from a project arriving for the first time', projFind(m4.projects, 3).items.length === 0);
      var m5 = mergeProjectsData([{ id:1, name:'K', updated:1000, items:[] }], [], { 1:5000 }, {});
      ok('a project tombstone removes the project', m5.projects.length === 0);
      var m6 = mergeProjectsData([], [{ id:4, name:'K', updated:9000, items:[] }], { 4:5000 }, {});
      ok('a project edited after its tombstone survives', m6.projects.length === 1);
      // v296 field-fill: an older copy that never heard of sentAt can't wipe it.
      var m7 = mergeProjectsData([{ id:1, name:'K', updated:1000, items:[ item(11, 'task', 'a', { sentAt:777, updated:1000 }) ] }],
                                 [{ id:1, name:'K', updated:1000, items:[ { id:11, type:'task', title:'a', updated:2000 } ] }], {}, {});
      ok('an older build\\'s item copy cannot drop a field it does not know', projFind(m7.projects[0].items, 11).sentAt === 777);

      // ── Home line ────────────────────────────────────────────────────────
      storeSet('fl4_projects', [
        { id:1, name:'Kitchen', status:'active', updated:1, items:[ item(11, 'task', 'Late', { date:day(-2) }), item(12, 'task', 'Soon', { date:day(3) }), item(13, 'task', 'Done', { done:true }) ] },
        { id:2, name:'Shed',    status:'idea',   updated:1, items:[ item(21, 'task', 'Idea task') ] },
        { id:3, name:'Hall',    status:'done',   updated:1, items:[ item(31, 'task', 'Leftover') ] }
      ]);
      var hs = projHomeSummary();
      ok('Home counts open tasks in active projects only (not Idea, not Done)', hs && hs.open === 2, JSON.stringify(hs));
      ok('and counts the overdue one', hs && hs.overdue === 1, JSON.stringify(hs));
      ok('and deep-links when they all sit in one project', hs && hs.onlyId === 1, JSON.stringify(hs));
      switchSection('home');
      var today = document.getElementById('homeTodayCard').textContent;
      ok('the Home Today card shows the line', today.indexOf('2 open project tasks') !== -1 && today.indexOf('1 overdue') !== -1, today);
      storeSet('fl4_projects', [ { id:1, name:'K', status:'active', updated:1, items:[ item(11, 'task', 'x', { done:true }) ] } ]);
      ok('no open tasks, no line', projHomeSummary() === null);

      // ── Cost roll-up ─────────────────────────────────────────────────────
      var costP = { items:[ item(1, 'cost', 'a', { amount:42.5 }), item(2, 'cost', 'b', { amount:300 }), item(3, 'cost', 'c', { amount:'' }), item(4, 'quote', 'q', { amount:999 }) ] };
      ok('spent totals the costs only, skipping a blank amount', projSpent(costP) === 342.5, 'got ' + projSpent(costP));
      ok('no priced cost reads as null, not 0', projSpent({ items:[ item(1, 'cost', 'a') ] }) === null);

      // ── One-way copy to To-do ────────────────────────────────────────────
      storeSet('fl4_projects', [ { id:1, name:'Kitchen', status:'active', updated:1, items:[ item(11, 'task', 'Book the electrician zz85', { date:day(4) }) ] } ]);
      var before = loadListData('todo').items.length;
      ok('copying a task reports success', projSendTaskToTodo(1, 11) === true);
      var todoItem = loadListData('todo').items.filter(function(x){ return x.name === 'Book the electrician zz85'; })[0];
      ok('it lands on To-do once, with its due date', !!todoItem && todoItem.dueDate === day(4) && loadListData('todo').items.length === before + 1);
      ok('the copy carries no link back to the project', todoItem && !('projectId' in todoItem) && !('itemId' in todoItem));
      ok('the task is marked as copied', projFind(getProjects()[0].items, 11).sentAt > 0);
      ok('a second copy is refused while the first is still open', projSendTaskToTodo(1, 11) === false &&
        loadListData('todo').items.filter(function(x){ return x.name === 'Book the electrician zz85'; }).length === 1);
      todoItem.done = true;
      ok('ticking the To-do copy does not tick the project task', projFind(getProjects()[0].items, 11).done === false);

      // ── Backup round trip ────────────────────────────────────────────────
      var hostile = [ { id:50, name:'Restored', status:'planning', updated:1,
                        items:[ item(51, 'link', 'bad', { url:'javascript:alert(1)' }), item(52, 'link', 'good', { url:'https://example.com/x' }) ] } ];
      storeSet('fl4_projects', []);
      storeSet('fl4_tomb_projects', { 50:Date.now() });
      storeSet('fl4_tomb_projitems', { 52:Date.now() });
      var imp = importBackupData({ projects: JSON.parse(JSON.stringify(hostile)) });
      var got = projFind(getProjects(), 50);
      ok('a restore brings the project back and counts it', !!got && imp.projects === 1, JSON.stringify(imp));
      ok('a restore clears the project and item tombstones (non-medical: resurrect)',
        !getTombs('projects')[50] && !getTombs('projitems')[52]);
      ok('a restored javascript: link is refused on the way in', got && projFind(got.items, 51).url === '');
      ok('a restored https link is kept', got && projFind(got.items, 52).url === 'https://example.com/x');
      ok('the export payload carries the projects', Array.isArray(buildExportPayload().projects) && buildExportPayload().projects.length === 1);

      // ── Render: reachable, escaped, link gated at render ─────────────────
      storeSet('fl4_projects', [ { id:60, name:'<img src=x onerror=window.__pjXss=1>', status:'active', target:'', notes:'', updated:1,
        items:[ item(61, 'link', 'raw', { url:'javascript:window.__pjXss=1' }), item(62, 'task', 'Tick me') ] } ]);
      window.__pjXss = 0;
      openRecord('projects', 60);
      var content = document.getElementById('projectsContent');
      ok('openRecord lands on the project detail', currentSection === 'projects' && _projView === 'detail' && _projOpenId === 60);
      ok('the project name is escaped', !content.querySelector('img[src="x"]') && window.__pjXss === 0);
      ok('a stored javascript: url never becomes an href', !content.querySelector('a[href^="javascript"]'));
      content.querySelector('.proj-tick[data-iid="62"]').click();
      ok('tapping the circle ticks the task', projFind(getProjects()[0].items, 62).done === true);
      ok('a tick stamps the item, not the project', getProjects()[0].updated === 1);
      document.getElementById('projBack').click();
      ok('back goes to the project list', _projView === 'list' && document.querySelectorAll('#projectsContent .proj-card').length === 1);
      document.getElementById('projNewBtn').click();
      ok('the header + opens the project editor', _projView === 'editor' && _projEditing === true);
      ok('the back button asks before discarding the editor', closeTopOverlay() === true);
      var cfNo = document.getElementById('_cfNo'); if (cfNo) cfNo.click();   // close the Discard? dialog it opened
      document.getElementById('projEdCancel').click();
      ok('Cancel leaves the editor', _projView === 'list' && _projEditing === false);
      ok('global search finds a project by what is inside it', (function(){
        var r = globalSearch('Tick me'); return r.groups.some(function(g){ return g.key === 'projects' && g.items.length === 1; });
      })());

      // ── Clean up ─────────────────────────────────────────────────────────
      storeSet('fl4_projects', saved || []); if (saved == null) localStorage.removeItem('fl4_projects');
      storeSet('fl4_tomb_projects', savedT || {}); if (savedT == null) localStorage.removeItem('fl4_tomb_projects');
      storeSet('fl4_tomb_projitems', savedI || {}); if (savedI == null) localStorage.removeItem('fl4_tomb_projitems');
      listData.todo = savedTodo; storeSet(LIST_CONFIG.todo.key, savedTodo);
      _projView = 'list'; _projOpenId = null;
      switchSection('home');
      return {pass:pass, fail:fail};
    })()`);
    return result;
  },
};
