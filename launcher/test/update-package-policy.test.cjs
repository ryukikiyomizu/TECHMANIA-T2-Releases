const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const updater = fs.readFileSync(path.join(__dirname, '..', '..', 'TECHMANIA-Updater.ps1'), 'utf8');
const recoveryBatch = fs.readFileSync(path.join(__dirname, '..', '..', 'Update TECHMANIA.bat'), 'utf8');
const launcherPackage = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

test('uses the MXGG identity for both launcher executables', () => {
  assert.equal(launcherPackage.build.productName, 'MXGG-TECHMANIA Launcher');
  assert.equal(launcherPackage.build.executableName, 'MXGG-TECHMANIA-Launcher');
  assert.equal(launcherPackage.build.artifactName, 'MXGG-TECHMANIA-Launcher.${ext}');
});

test('supports selective client, T2 theme, and launcher packages', () => {
  assert.match(updater, /\$hasClient = Test-Path/);
  assert.match(updater, /\$hasT2Theme = Test-Path/);
  assert.match(updater, /'Themes\\Default\.tmtheme'/);
  assert.match(updater, /Selective update contains an unsupported file/);
  assert.match(updater, /if \(\$hasClient -and \(Test-Path -LiteralPath \$bundledTutorial\)\)/);
  assert.match(updater, /Install-StagedLauncher/);
  assert.match(updater, /MXGG-TECHMANIA-Launcher\.exe/);
  assert.match(updater, /MXGG-TECHMANIA-Launcher\.update/);
  assert.match(updater, /TECHMANIA-Launcher\.exe/);
  assert.match(updater, /Install-StagedLauncher\s+Write-Step 'Checking GitHub Releases\.\.\.'/);
});

test('never launches the legacy TECHMANIA launcher', () => {
  assert.doesNotMatch(recoveryBatch, /start\s+""\s+"%~dp0TECHMANIA-Launcher\.exe"/i);
  assert.match(recoveryBatch, /move .*TECHMANIA-Launcher\.exe.*MXGG-TECHMANIA-Launcher\.exe/i);
});
