// Bundles the whole game (JS + CSS + three.js) into one self-contained
// HTML file: dist-single/index.html. Useful for itch.io, email or hosts
// that serve a single file. Vercel uses the normal `npm run build`.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const out = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  outdir: 'tmp',
  loader: { '.css': 'css' },
});
const js = out.outputFiles.find((f) => f.path.endsWith('.js')).text;
const css = out.outputFiles.find((f) => f.path.endsWith('.css'))?.text || '';
let html = readFileSync('index.html', 'utf8');
html = html.replace('<script type="module" src="/src/main.js"></script>', () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`);
html = html.replace('</head>', () => `<style>${css}</style>\n</head>`);
mkdirSync('dist-single', { recursive: true });
writeFileSync('dist-single/index.html', html);
console.log(`dist-single/index.html  ${(html.length / 1024).toFixed(0)} kB`);
