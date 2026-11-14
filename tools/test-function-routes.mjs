// Netlify reads `export const config = { path }` statically at build time. An imported constant is not
// resolved and the function silently gets no route (404 on /api/...), so every path must be a literal.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'netlify', 'functions');
let n = 0;
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.mjs') && !f.startsWith('_'))) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const m = src.match(/export const config\s*=\s*\{([\s\S]*?)\};/);
  if (!m || !/\bpath\s*:/.test(m[1])) continue;
  for (const p of m[1].matchAll(/\bpath\s*:\s*([^,\n}]+)/g)) {
    assert.match(p[1].trim(), /^(['"]).*\1$|^\[/, `${f}: config.path must be a string literal, got ${p[1].trim()}`);
  }
  n++;
}
const want = { 'family-device.mjs': '/api/family/device', 'family-handoff.mjs': '/api/family/handoff' };
for (const [f, route] of Object.entries(want)) assert.ok(fs.readFileSync(path.join(dir, f), 'utf8').includes(`path: '${route}'`), `${f} routes ${route}`);
console.log(`PASS ${n} function routes are static literals`);
