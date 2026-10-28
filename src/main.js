import './styles.css';
import { Game } from './core/Game.js';

const game = new Game(document.getElementById('app'));
try {
  game.init();
} catch (err) {
  console.error(err);
  const el = document.getElementById('boot-error');
  el.hidden = false;
  el.textContent = 'This browser could not start WebGL. Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration on.';
}
window.__game = game; // handy for debugging in the console
