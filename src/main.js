import './ui/style.css';
import { startGame } from './game/game.js';

const params = new URLSearchParams(location.search);
const loading = document.getElementById('loading');
const hasWebGL2 = (() => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } })();

if (!hasWebGL2) {
  loading.classList.add('error');
} else if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches && !params.has('force')) {
  loading.classList.add('mobile');
} else {
  const bar = loading.querySelector('.bar i');
  startGame({
    canvas: document.getElementById('game'),
    params,
    onProgress: (f) => { bar.style.width = `${Math.round(8 + f * 92)}%`; },
  })
    .then(() => loading.remove())
    .catch((err) => { console.error(err); loading.classList.add('error'); });
}
