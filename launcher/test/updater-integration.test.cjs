const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const updaterSource = path.join(__dirname, '..', '..', 'TECHMANIA-Updater.ps1');
const swapSource = path.join(__dirname, '..', '..', 'TECHMANIA-Launcher-Swap.ps1');

function write(root, relativePath, contents) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

function makeRelease(tempRoot, files) {
  const payload = path.join(tempRoot, 'payload');
  const archive = path.join(tempRoot, 'TECHMANIA-Update.zip');
  const checksum = path.join(tempRoot, 'TECHMANIA-Update.zip.sha256');
  fs.mkdirSync(payload);
  for (const [relativePath, contents] of Object.entries(files)) write(payload, relativePath, contents);

  const packed = spawnSync(powershell, [
    '-NoProfile', '-NonInteractive', '-Command',
    "Compress-Archive -Path (Join-Path $env:TEST_PAYLOAD '*') -DestinationPath $env:TEST_ARCHIVE -Force"
  ], { env: { ...process.env, TEST_PAYLOAD: payload, TEST_ARCHIVE: archive }, encoding: 'utf8' });
  assert.equal(packed.status, 0, packed.stderr);

  const hash = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex').toUpperCase();
  fs.writeFileSync(checksum, `${hash}  TECHMANIA-Update.zip\n`);
  return { archive, checksum };
}

function runUpdater(gameRoot, release, force = true) {
  const updater = path.join(gameRoot, 'TECHMANIA-Updater.ps1');
  const wrapper = path.join(gameRoot, 'run-test-update.ps1');
  fs.copyFileSync(updaterSource, updater);
  fs.writeFileSync(wrapper, String.raw`
Import-Module Microsoft.PowerShell.Utility
function Get-Process {
    param([string]$Name, [System.Management.Automation.ActionPreference]$ErrorAction)
    if ($Name -eq 'TECHMANIA') { return $null }
    Microsoft.PowerShell.Management\Get-Process @PSBoundParameters
}
function Invoke-RestMethod {
    return [pscustomobject]@{
        tag_name = $env:TEST_RELEASE_TAG
        assets = @(
            [pscustomobject]@{ name = 'TECHMANIA-Update.zip'; browser_download_url = $env:TEST_RELEASE_ZIP },
            [pscustomobject]@{ name = 'TECHMANIA-Update.zip.sha256'; browser_download_url = $env:TEST_RELEASE_CHECKSUM }
        )
    }
}
function Invoke-WebRequest {
    param([switch]$UseBasicParsing, [hashtable]$Headers, [string]$Uri, [string]$OutFile)
    Copy-Item -LiteralPath $Uri -Destination $OutFile -Force
}
if ($env:TEST_FORCE -eq '1') {
    & $env:TEST_UPDATER -Force
}
else {
    & $env:TEST_UPDATER
}
exit $LASTEXITCODE
`);

  return spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', wrapper], {
    env: {
      ...process.env,
      TEST_RELEASE_TAG: 'v-test.1',
      TEST_RELEASE_ZIP: release.archive,
      TEST_RELEASE_CHECKSUM: release.checksum,
      TEST_UPDATER: updater,
      TEST_FORCE: force ? '1' : '0'
    },
    encoding: 'utf8'
  });
}

test('installs a theme-only release and records its tag', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mxgg-updater-theme-'));
  const gameRoot = path.join(tempRoot, 'game');
  fs.mkdirSync(gameRoot);
  write(gameRoot, 'Themes/Technika 2.tmtheme', 'old-theme');
  const release = makeRelease(tempRoot, { 'Themes/Technika 2.tmtheme': 'new-theme' });

  const result = runUpdater(gameRoot, release);

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(fs.readFileSync(path.join(gameRoot, 'Themes/Technika 2.tmtheme'), 'utf8'), 'new-theme');
  assert.equal(fs.readFileSync(path.join(gameRoot, '.techmania-release'), 'utf8').trim(), 'v-test.1');
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('installs a client-only release without replacing the T2 theme', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mxgg-updater-client-'));
  const gameRoot = path.join(tempRoot, 'game');
  fs.mkdirSync(gameRoot);
  write(gameRoot, 'Themes/Technika 2.tmtheme', 'player-theme');
  const release = makeRelease(tempRoot, {
    'TECHMANIA.exe': 'new-client',
    'TECHMANIA_Data/Managed/Assembly-CSharp.dll': 'new-managed',
    'TECHMANIA_Data/Plugins/x86_64/TechmaniaNfcHook.dll': 'new-nfc',
    'Themes/Default.tmtheme': 'new-default'
  });

  const result = runUpdater(gameRoot, release);

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(fs.readFileSync(path.join(gameRoot, 'TECHMANIA.exe'), 'utf8'), 'new-client');
  assert.equal(fs.readFileSync(path.join(gameRoot, 'Themes/Default.tmtheme'), 'utf8'), 'new-default');
  assert.equal(fs.readFileSync(path.join(gameRoot, 'Themes/Technika 2.tmtheme'), 'utf8'), 'player-theme');
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('installs a combined client and T2 release', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mxgg-updater-combined-'));
  const gameRoot = path.join(tempRoot, 'game');
  fs.mkdirSync(gameRoot);
  const release = makeRelease(tempRoot, {
    'TECHMANIA.exe': 'new-client',
    'TECHMANIA_Data/Managed/Assembly-CSharp.dll': 'new-managed',
    'TECHMANIA_Data/Plugins/x86_64/TechmaniaNfcHook.dll': 'new-nfc',
    'Themes/Default.tmtheme': 'new-default',
    'Themes/Technika 2.tmtheme': 'new-theme'
  });

  const result = runUpdater(gameRoot, release);

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(fs.readFileSync(path.join(gameRoot, 'TECHMANIA.exe'), 'utf8'), 'new-client');
  assert.equal(fs.readFileSync(path.join(gameRoot, 'Themes/Technika 2.tmtheme'), 'utf8'), 'new-theme');
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('installs a launcher-only release without creating another launcher executable', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mxgg-updater-launcher-release-'));
  const gameRoot = path.join(tempRoot, 'game');
  fs.mkdirSync(gameRoot);
  write(gameRoot, 'MXGG-TECHMANIA-Launcher.exe', 'old-launcher');
  const release = makeRelease(tempRoot, { 'MXGG-TECHMANIA-Launcher.update': 'new-launcher' });

  const result = runUpdater(gameRoot, release);

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(fs.readFileSync(path.join(gameRoot, 'MXGG-TECHMANIA-Launcher.exe'), 'utf8'), 'new-launcher');
  assert.equal(fs.existsSync(path.join(gameRoot, 'MXGG-TECHMANIA-Launcher.update')), false);
  assert.equal(fs.existsSync(path.join(gameRoot, 'TECHMANIA-Launcher.exe')), false);
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('promotes new and legacy staged launchers to the permanent MXGG entrypoint', () => {
  for (const stagedName of ['MXGG-TECHMANIA-Launcher.update', 'TECHMANIA-Launcher.exe']) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mxgg-updater-launcher-'));
    const gameRoot = path.join(tempRoot, 'game');
    fs.mkdirSync(gameRoot);
    write(gameRoot, 'MXGG-TECHMANIA-Launcher.exe', 'old-launcher');
    write(gameRoot, '.techmania-release', 'v-test.1');
    write(gameRoot, stagedName, 'new-launcher');
    const release = makeRelease(tempRoot, { 'Themes/Technika 2.tmtheme': 'unchanged-theme' });

    const result = runUpdater(gameRoot, release, false);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Launcher updated/);
    assert.equal(fs.readFileSync(path.join(gameRoot, 'MXGG-TECHMANIA-Launcher.exe'), 'utf8'), 'new-launcher');
    assert.equal(fs.existsSync(path.join(gameRoot, stagedName)), false);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('prefers the MXGG update and removes a leftover legacy launcher', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mxgg-updater-launcher-cleanup-'));
  const gameRoot = path.join(tempRoot, 'game');
  fs.mkdirSync(gameRoot);
  write(gameRoot, 'MXGG-TECHMANIA-Launcher.exe', 'old-launcher');
  write(gameRoot, '.techmania-release', 'v-test.1');
  write(gameRoot, 'MXGG-TECHMANIA-Launcher.update', 'new-launcher');
  write(gameRoot, 'TECHMANIA-Launcher.exe', 'legacy-launcher');
  const release = makeRelease(tempRoot, { 'Themes/Technika 2.tmtheme': 'unchanged-theme' });

  const result = runUpdater(gameRoot, release, false);

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(fs.readFileSync(path.join(gameRoot, 'MXGG-TECHMANIA-Launcher.exe'), 'utf8'), 'new-launcher');
  assert.equal(fs.existsSync(path.join(gameRoot, 'MXGG-TECHMANIA-Launcher.update')), false);
  assert.equal(fs.existsSync(path.join(gameRoot, 'TECHMANIA-Launcher.exe')), false);
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('swap helper installs the MXGG update and removes a legacy launcher', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mxgg-launcher-swap-'));
  const staged = path.join(tempRoot, 'MXGG-TECHMANIA-Launcher.update');
  const target = path.join(tempRoot, 'MXGG-TECHMANIA-Launcher.exe');
  const legacy = path.join(tempRoot, 'TECHMANIA-Launcher.exe');
  const log = path.join(tempRoot, 'TECHMANIA-Launcher.log');
  fs.writeFileSync(staged, 'new-launcher');
  fs.writeFileSync(target, 'old-launcher');
  fs.writeFileSync(legacy, 'legacy-launcher');

  const result = spawnSync(powershell, [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', swapSource,
    '-StagedPath', staged, '-TargetPath', target, '-CleanupPath', legacy, '-LogPath', log
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(fs.readFileSync(target, 'utf8'), 'new-launcher');
  assert.equal(fs.existsSync(staged), false);
  assert.equal(fs.existsSync(legacy), false);
  assert.match(fs.readFileSync(log, 'utf8'), /Launcher update installed/);
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('rejects non-theme files in a theme-only release', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mxgg-updater-policy-'));
  const gameRoot = path.join(tempRoot, 'game');
  fs.mkdirSync(gameRoot);
  write(gameRoot, 'Themes/Technika 2.tmtheme', 'old-theme');
  const release = makeRelease(tempRoot, {
    'Themes/Technika 2.tmtheme': 'new-theme',
    'unexpected.dll': 'nope'
  });

  const result = runUpdater(gameRoot, release);

  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /Selective update contains an unsupported file/);
  assert.equal(fs.readFileSync(path.join(gameRoot, 'Themes/Technika 2.tmtheme'), 'utf8'), 'old-theme');
  assert.equal(fs.existsSync(path.join(gameRoot, '.techmania-release')), false);
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('rolls back files when installation fails partway through', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mxgg-updater-rollback-'));
  const gameRoot = path.join(tempRoot, 'game');
  fs.mkdirSync(gameRoot);
  write(gameRoot, 'A-first.txt', 'old-value');
  write(gameRoot, 'B-blocked', 'this file blocks creation of a directory');
  const release = makeRelease(tempRoot, {
    'A-first.txt': 'new-value',
    'B-blocked/child.txt': 'install must fail here',
    'TECHMANIA.exe': 'client',
    'TECHMANIA_Data/Managed/Assembly-CSharp.dll': 'managed',
    'TECHMANIA_Data/Plugins/x86_64/TechmaniaNfcHook.dll': 'nfc',
    'Themes/Default.tmtheme': 'default'
  });

  const result = runUpdater(gameRoot, release);

  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /Rolling back incomplete update/);
  assert.equal(fs.readFileSync(path.join(gameRoot, 'A-first.txt'), 'utf8'), 'old-value');
  assert.equal(fs.existsSync(path.join(gameRoot, '.techmania-release')), false);
  fs.rmSync(tempRoot, { recursive: true, force: true });
});
