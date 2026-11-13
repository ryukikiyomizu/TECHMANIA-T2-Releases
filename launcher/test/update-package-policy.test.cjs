const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const updater = fs.readFileSync(path.join(__dirname, '..', '..', 'TECHMANIA-Updater.ps1'), 'utf8');

test('supports selective client and T2 theme packages', () => {
  assert.match(updater, /\$hasClient = Test-Path/);
  assert.match(updater, /\$hasT2Theme = Test-Path/);
  assert.match(updater, /'Themes\\Default\.tmtheme'/);
  assert.match(updater, /Theme-only update contains a non-theme file/);
  assert.match(updater, /if \(\$hasClient -and \(Test-Path -LiteralPath \$bundledTutorial\)\)/);
  assert.match(updater, /Install-StagedLauncher/);
  assert.match(updater, /MXGG-TECHMANIA-Launcher\.exe/);
});
