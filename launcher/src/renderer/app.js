import { animate, stagger } from '../../node_modules/animejs/dist/modules/index.js';

const body = document.body;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const progress = document.querySelector('.progress-track');
const progressFill = document.querySelector('.progress-fill');
const updater = document.querySelector('.updater');
const activityLabel = document.querySelector('#activity-label');
const retryButton = document.querySelector('#retry-button');
const offlineButton = document.querySelector('#offline-button');
const logButton = document.querySelector('#log-button');

const statusCopy = {
  check: 'Checking for updates…',
  download: 'Downloading update 1 of 1…',
  verify: 'Verifying update…',
  patch: 'Installing TECHMANIA + T2…',
  rollback: 'Restoring the previous installation…',
  ready: 'Update complete.',
  launching: 'Starting TECHMANIA…'
};
const indeterminateStages = new Set(['check', 'download', 'verify', 'patch', 'rollback']);

function duration(value) {
  return reducedMotion ? 1 : value;
}

function intro() {
  body.classList.remove('is-booting');
  animate(['.status', '.progress-track'], {
    opacity: [0, 1],
    y: [6, 0],
    delay: reducedMotion ? 0 : stagger(70),
    duration: duration(420),
    ease: 'outExpo'
  });
}

function renderState(state) {
  body.dataset.stage = state.stage;
  activityLabel.textContent = state.message || statusCopy[state.stage] || 'Working…';

  const value = Number.isFinite(state.progress) ? state.progress : 0;
  const isIndeterminate = indeterminateStages.has(state.stage);
  progress.classList.toggle('is-indeterminate', isIndeterminate);
  progress.setAttribute('aria-valuetext', activityLabel.textContent);
  if (isIndeterminate) {
    progress.removeAttribute('aria-valuenow');
  } else {
    progress.setAttribute('aria-valuenow', String(value));
    animate(progressFill, { scaleX: value / 100, duration: duration(300), ease: 'outExpo' });
  }

  if (state.stage === 'launching') {
    animate(updater, { opacity: [1, 0], scale: [1, 0.98], duration: duration(500), ease: 'inExpo' });
  } else if (state.stage === 'error') {
    animate(updater, { opacity: 1, scale: 1, duration: duration(180), ease: 'outExpo' });
  }
}

retryButton.addEventListener('click', () => window.mxgg.start());
offlineButton.addEventListener('click', () => window.mxgg.launchOffline());
logButton.addEventListener('click', () => window.mxgg.openLog());
window.mxgg.onState(renderState);

intro();
await window.mxgg.start();
