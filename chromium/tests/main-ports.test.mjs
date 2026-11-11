// Each ported main-process evaluation must match a function shipping's steps
// actually pass to ctx.app.evaluate, source for source.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PORTS, shippingEvaluations, sourceKey} from './lib/main-ports.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHIPPING = '6479ed3a314e4fd6219b8de1598bacffa78b4d7c';
const steps = file => execFileSync('git', ['show', `${SHIPPING}:test/desktop/steps/${file}`], {cwd: root, encoding: 'utf8'});

test('every port answers a shipping evaluation', () => {
  const shipped = new Set(['mini-window.steps.js', 'link-routing.steps.js', 'http-auth.steps.js', 'glance.steps.js', 'named-workspaces.steps.js', 'workspace-lifecycle.steps.js'].flatMap(file => shippingEvaluations(steps(file))).map(sourceKey));
  for (const key of Object.keys(PORTS)) assert.ok(shipped.has(key), key);
});

test('extraction keeps a function whole, up to its own argument list', () => {
  const [a, b] = shippingEvaluations("ctx.app.evaluate(({ x }) => { f(`${x}`, ')'); }, 1); ctx.app.evaluate(() => y)");
  assert.equal(a, "({ x }) => { f(`${x}`, ')'); }");
  assert.equal(b, '() => y');
  assert.equal(sourceKey(() => y), sourceKey(b));
});
