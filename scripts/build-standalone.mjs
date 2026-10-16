#!/usr/bin/env node
/*
 * Builds standalone/pacben.html: the whole game in one file that opens
 * straight from disk or any static host, with no server and no install.
 *
 * Each module in lib/ has its types stripped (by Node itself) and is wrapped
 * in a function scope; imports become reads from the modules built before it.
 * The lib/ files keep to that shape: named imports from './x.ts', and
 * `export function` / `export const` declarations.
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lib = join(root, 'lib');
const out = join(root, 'standalone');

const IMPORT = /import\s*(type\s*)?\{([^}]*)\}\s*from\s*['"]\.\/([\w-]+)\.ts['"];?/g;
const EXPORT_DECL = /^export\s+(function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

const sources = new Map();
for (const file of readdirSync(lib).filter((f) => f.endsWith('.ts'))) {
  sources.set(file.replace(/\.ts$/, ''), readFileSync(join(lib, file), 'utf8'));
}

const deps = new Map();
for (const [name, src] of sources) {
  const list = [];
  for (const m of src.matchAll(IMPORT)) if (!m[1]) list.push(m[3]);
  deps.set(name, list);
}

const order = [];
const state = new Map();
function visit(name, trail) {
  if (state.get(name) === 'done') return;
  if (state.get(name) === 'visiting') throw new Error(`Import cycle: ${[...trail, name].join(' -> ')}`);
  if (!sources.has(name)) throw new Error(`Unknown module ./${name}.ts`);
  state.set(name, 'visiting');
  for (const d of deps.get(name)) visit(d, [...trail, name]);
  state.set(name, 'done');
  order.push(name);
}
visit('main', []);

let bundle = '';
for (const name of order) {
  let code = stripTypeScriptTypes(sources.get(name), { mode: 'strip' });
  code = code.replace(IMPORT, (_all, isType, names, from) => {
    if (isType) return '';
    const bindings = names
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => n.replace(/\s+as\s+/, ': '));
    return `const { ${bindings.join(', ')} } = __m[${JSON.stringify(from)}];`;
  });
  const exported = [];
  code = code.replace(EXPORT_DECL, (_all, kind, id) => {
    exported.push(id);
    return `${kind} ${id}`;
  });
  if (/^\s*export\s/m.test(code)) throw new Error(`${name}.ts has an export the bundler doesn't understand`);
  bundle += `__m[${JSON.stringify(name)}] = (() => {\n${code}\nreturn { ${exported.join(', ')} };\n})();\n`;
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#03050d">
<title>Pac Ben</title>
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;700;800;900&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; height: 100%; background: #03050d; overflow: hidden; overscroll-behavior: none; }
  body { position: fixed; inset: 0; }
  #game { position: absolute; inset: 0; padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); box-sizing: border-box; }
</style>
</head>
<body>
<div id="game"></div>
<script>
"use strict";
const __m = {};
${bundle}
const level = Number(new URLSearchParams(location.search).get("level")) || undefined;
// Hosts that reload the page in place (such as Claude artifacts) can hand back the run in progress.
const hot = window.claude && window.claude.hot;
const boot = (data) => __m.main.startPacBen(document.getElementById("game"), {
  level,
  resume: data && data.resume,
  expose: (snapshot) => { if (hot && hot.snapshot) hot.snapshot(() => ({ resume: snapshot() })); },
});
if (hot && hot.ready) hot.ready(boot);
else boot((hot && hot.data) || {});
</script>
</body>
</html>
`;

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'pacben.html'), html);
console.log(`standalone/pacben.html: ${order.length} modules, ${(html.length / 1024).toFixed(0)} KB`);
