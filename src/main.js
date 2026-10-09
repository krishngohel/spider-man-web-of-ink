import './ui/style.css';
import { startGame } from './game/game.js';

const params = new URLSearchParams(location.search);
const loading = document.getElementById('loading');
const hasWebGL2 = (() => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } })();

// Only a browser with no WebGL 2 at all gets the "needs WebGL 2" page; any other failure says
// something went wrong, with the error, and offers a reload (index.html's __bootFail).
function bootFailed(err) {
  console.error(err);
  window.__booted = true;
  if (window.__bootFail) window.__bootFail(err);
  else loading.classList.add('failed');
}

if (!hasWebGL2) {
  window.__booted = true;
  loading.classList.add('error');
} else if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches && !params.has('force')) {
  window.__booted = true;
  loading.classList.add('mobile');
} else {
  const bar = loading.querySelector('.bar i');
  startGame({
    canvas: document.getElementById('game'),
    params,
    onProgress: (f) => { bar.style.width = `${Math.round(8 + f * 92)}%`; },
  })
    .then(() => { window.__booted = true; loading.remove(); })
    .catch(bootFailed);
}
