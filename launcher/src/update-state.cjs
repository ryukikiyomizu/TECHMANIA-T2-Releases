const VERSION_PATTERN = /(?:Downloading|to|up to date \()([^).]+(?:\.[^).]+)*)\)?\.?$/i;

function versionFrom(line) {
  const match = line.match(VERSION_PATTERN);
  return match?.[1]?.trim() || null;
}

function classifyUpdaterLine(rawLine) {
  const line = rawLine.replace(/^\[TECHMANIA Updater\]\s*/i, '').trim();
  const normalized = line.toLowerCase();

  if (normalized.startsWith('checking github releases')) {
    return { stage: 'check', progress: 12, message: 'Checking the TECHMANIA release channel…' };
  }
  if (normalized.startsWith('already up to date')) {
    return { stage: 'ready', progress: 100, message: 'Client and T2 are current.', version: versionFrom(line) };
  }
  if (normalized.startsWith('downloading')) {
    return { stage: 'download', progress: 38, message: 'Downloading the verified cabinet build…', version: versionFrom(line) };
  }
  if (normalized.startsWith('extracting verified update')) {
    return { stage: 'verify', progress: 64, message: 'Checksum passed. Preparing the patch…' };
  }
  if (normalized.startsWith('installing update')) {
    return { stage: 'patch', progress: 82, message: 'Installing TECHMANIA and the T2 theme…' };
  }
  if (normalized.startsWith('rolling back incomplete update')) {
    return { stage: 'rollback', progress: 82, message: 'Restoring the previous installation…' };
  }
  if (normalized.startsWith('updated successfully')) {
    return { stage: 'ready', progress: 100, message: 'Sync complete. Handing off to TECHMANIA…', version: versionFrom(line) };
  }
  if (normalized.startsWith('error:')) {
    return { stage: 'error', progress: 0, message: line.slice(6).trim() || 'The update could not finish.' };
  }
  return null;
}

module.exports = { classifyUpdaterLine, versionFrom };
