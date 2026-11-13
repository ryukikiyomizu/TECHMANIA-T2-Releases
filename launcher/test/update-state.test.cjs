const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyUpdaterLine } = require('../src/update-state.cjs');

test('maps updater output to launcher stages', () => {
  assert.deepEqual(classifyUpdaterLine('[TECHMANIA Updater] Checking GitHub Releases...'), {
    stage: 'check', progress: 12, message: 'Checking the TECHMANIA release channel…'
  });
  assert.equal(classifyUpdaterLine('[TECHMANIA Updater] Installing update...').stage, 'patch');
  assert.equal(classifyUpdaterLine('[TECHMANIA Updater] Rolling back incomplete update...').stage, 'rollback');
  assert.equal(classifyUpdaterLine('[TECHMANIA Updater] ERROR: checksum mismatch').stage, 'error');
});

test('extracts release tags from current and updated output', () => {
  assert.equal(classifyUpdaterLine('[TECHMANIA Updater] Already up to date (v2.4.1-t2.20261112.5).').version, 'v2.4.1-t2.20261112.5');
  assert.equal(classifyUpdaterLine('[TECHMANIA Updater] Updated successfully to v2.4.2-t2.20261113.1.').version, 'v2.4.2-t2.20261113.1');
});
