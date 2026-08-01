#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { launch } = require('./harness');
const { startServer } = require('./server');

const REPO_ROOT = path.resolve(__dirname, '..');
const INDEX_URL = 'file://' + path.join(REPO_ROOT, 'index.html');
const CASES_DIR = path.join(__dirname, 'cases');
const SW_CASES_DIR = path.join(__dirname, 'sw-cases');

// The hostname the app treats as production (`_isTestBuild` in index.html).
// Chrome's --host-resolver-rules points it at our own local server, so the SW
// phase exercises the real production code path — guards included — with
// nothing leaving the machine. See tests/server.js for why this is needed.
const SW_HOST = 'coshea321.github.io';

function listCases(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .sort();
}

// Shared per-file runner for both phases. `beforeEach(file, index)` does the
// phase's own state isolation; the reporting below is identical either way.
async function runCases(page, dir, caseFiles, beforeEach, annotations) {
  let fails = 0;
  for (let i = 0; i < caseFiles.length; i++) {
    const file = caseFiles[i];
    const caseModule = require(path.join(dir, file));

    await beforeEach(file, i);

    const errsBefore = page.pageErrors.length;
    let result;
    try {
      result = await caseModule.run(page);
    } catch (e) {
      result = { pass: [], fail: [{ name: caseModule.name || file, detail: e.message }] };
    }

    const newPageErrors = page.pageErrors.slice(errsBefore);
    const caseFails = (result && result.fail) || [];
    const passes = (result && result.pass) || [];

    if (caseFails.length === 0 && newPageErrors.length === 0) {
      console.log('ok   ' + file + ' (' + passes.length + ' assertions)');
    } else {
      console.log('FAIL ' + file);
      caseFails.forEach((f) => {
        console.log('  - ' + f.name + ': ' + f.detail);
        annotations.push(file + ' — ' + f.name + ': ' + f.detail);
      });
      newPageErrors.forEach((e) => {
        console.log('  - unexpected page error: ' + e);
        annotations.push(file + ' — unexpected page error: ' + e);
      });
      fails += caseFails.length + newPageErrors.length;
    }
  }
  return fails;
}

// ── Phase 1: file:// — the whole behaviour suite (unchanged since v350) ──
async function runFilePhase(annotations) {
  const caseFiles = listCases(CASES_DIR);
  if (caseFiles.length === 0) {
    console.error('No test case files found in tests/cases/');
    process.exit(1);
  }

  const page = await launch();
  page.appUrl = INDEX_URL; // exposed so case files can drive their own clear+reload sequences
  let fails = 0;

  try {
    console.log('Booting ' + INDEX_URL);
    await page.navigate(INDEX_URL);
    if (page.pageErrors.length > 0) {
      console.log('FAIL boot — page error(s) on load:');
      page.pageErrors.forEach((e) => console.log('  ' + e));
      annotations.push('boot — page error on load: ' + page.pageErrors[0]);
      fails++;
    }

    // Fresh localStorage + reload before every case file except the first,
    // which runs against the boot state set up above. State isolation
    // between case files is mandatory; within a file, cases may share
    // state deliberately.
    fails += await runCases(
      page,
      CASES_DIR,
      caseFiles,
      async (file, i) => {
        if (i > 0) await page.reset(INDEX_URL);
      },
      annotations
    );
  } finally {
    await page.close();
  }
  return fails;
}

// ── Phase 2: http:// — service worker, update banner and dead-network opens ──
// A service worker cannot register on file://, so everything the startup-freeze
// analysis put under suspicion (claim 8) had no coverage at all. This phase runs
// its own server + browser: real origin, real SW, real cache.
async function runSwPhase(annotations) {
  const caseFiles = listCases(SW_CASES_DIR);
  if (caseFiles.length === 0) return 0;

  const server = startServer(REPO_ROOT);
  const port = await server.listen();
  const origin = 'http://' + SW_HOST + ':' + port;
  const appUrl = origin + '/index.html';

  // Chrome only grants a service worker to a secure context. This flag makes
  // the ONE local test origin count as secure; it applies to this throwaway
  // profile only, and is why the SW phase needs its own browser instance.
  const page = await launch({ extraArgs: ['--unsafely-treat-insecure-origin-as-secure=' + origin] });
  page.appUrl = appUrl;
  page.origin = origin;
  page.server = server;
  let fails = 0;

  try {
    console.log('\nBooting ' + appUrl + ' (service-worker phase)');
    await page.navigate(appUrl);
    if (page.pageErrors.length > 0) {
      console.log('FAIL sw boot — page error(s) on load:');
      page.pageErrors.forEach((e) => console.log('  ' + e));
      annotations.push('sw boot — page error on load: ' + page.pageErrors[0]);
      fails++;
    }

    fails += await runCases(
      page,
      SW_CASES_DIR,
      caseFiles,
      async (file, i) => {
        server.reset(); // undo any hang/fail mode or sw.js version override
        if (i > 0) await page.resetSW(appUrl);
      },
      annotations
    );
  } finally {
    await page.close();
    await server.close();
  }
  return fails;
}

async function main() {
  const annotations = [];
  let totalFail = 0;

  totalFail += await runFilePhase(annotations);
  totalFail += await runSwPhase(annotations);

  if (annotations.length > 0) {
    console.log('\nFailures (plain-English, shown on the PR Checks tab):');
    annotations.forEach((a) => console.log('::error::' + a));
  }

  if (totalFail > 0) {
    console.log('\n' + totalFail + ' failure(s).');
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main().catch((e) => {
  console.error('Test runner crashed: ' + ((e && e.stack) || e));
  process.exit(1);
});
