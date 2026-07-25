#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { launch } = require('./harness');

const REPO_ROOT = path.resolve(__dirname, '..');
const INDEX_URL = 'file://' + path.join(REPO_ROOT, 'index.html');
const CASES_DIR = path.join(__dirname, 'cases');

async function main() {
  const caseFiles = fs
    .readdirSync(CASES_DIR)
    .filter((f) => f.endsWith('.js'))
    .sort();

  if (caseFiles.length === 0) {
    console.error('No test case files found in tests/cases/');
    process.exit(1);
  }

  const page = await launch();
  page.appUrl = INDEX_URL; // exposed so case files can drive their own clear+reload sequences
  let totalFail = 0;
  const annotations = [];

  try {
    console.log('Booting ' + INDEX_URL);
    await page.navigate(INDEX_URL);
    if (page.pageErrors.length > 0) {
      console.log('FAIL boot — page error(s) on load:');
      page.pageErrors.forEach((e) => console.log('  ' + e));
      annotations.push('boot — page error on load: ' + page.pageErrors[0]);
      totalFail++;
    }

    for (let i = 0; i < caseFiles.length; i++) {
      const file = caseFiles[i];
      const caseModule = require(path.join(CASES_DIR, file));

      // Fresh localStorage + reload before every case file except the first,
      // which runs against the boot state set up above. State isolation
      // between case files is mandatory; within a file, cases may share
      // state deliberately.
      if (i > 0) {
        await page.reset(INDEX_URL);
      }

      const errsBefore = page.pageErrors.length;
      let result;
      try {
        result = await caseModule.run(page);
      } catch (e) {
        result = { pass: [], fail: [{ name: caseModule.name || file, detail: e.message }] };
      }

      const newPageErrors = page.pageErrors.slice(errsBefore);
      const fails = (result && result.fail) || [];
      const passes = (result && result.pass) || [];

      if (fails.length === 0 && newPageErrors.length === 0) {
        console.log('ok   ' + file + ' (' + passes.length + ' assertions)');
      } else {
        console.log('FAIL ' + file);
        fails.forEach((f) => {
          console.log('  - ' + f.name + ': ' + f.detail);
          annotations.push(file + ' — ' + f.name + ': ' + f.detail);
        });
        newPageErrors.forEach((e) => {
          console.log('  - unexpected page error: ' + e);
          annotations.push(file + ' — unexpected page error: ' + e);
        });
        totalFail += fails.length + newPageErrors.length;
      }
    }
  } finally {
    await page.close();
  }

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
