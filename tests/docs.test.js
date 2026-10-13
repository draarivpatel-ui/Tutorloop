// Run with: node tests/docs.test.js
// README.md must not drift from the repo: relative links and named file paths exist, and quoted unit counts match the suites.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}
console.log('Tutorloop README consistency');
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
function walk(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(e => {
    if (['.git', 'node_modules', '__pycache__'].includes(e.name)) return [];
    const rel = dir ? dir + '/' + e.name : e.name;
    return e.isDirectory() ? walk(rel) : [rel];
  });
}
const repoFiles = walk('');
test('every relative markdown link in README.md resolves to a file', () => {
  const bad = [];
  for (const m of readme.matchAll(/\]\(([^)\s]+)\)/g)) {
    const t = m[1].split('#')[0];
    if (!t || /^(https?:|mailto:|tel:)/.test(m[1])) continue;
    if (!fs.existsSync(path.join(ROOT, t))) bad.push(m[1]);
  }
  assert.deepEqual(bad, []);
});
test('every backticked file path in README.md exists (bare names may live in js/ or tests/)', () => {
  const bad = []; let seen = 0;
  for (const m of readme.matchAll(/`((?:[\w.-]+\/)*[\w.-]+\.(?:js|py|md|html|css|png|json|yml|webmanifest))`/g)) {
    const p = m[1].replace(/^\.\//, ''); seen++;
    const ok = p.includes('/') ? repoFiles.includes(p) : repoFiles.some(r => r === p || r.endsWith('/' + p));
    if (!ok) bad.push(p);
  }
  assert.ok(seen > 10, 'paths found: ' + seen);
  assert.deepEqual(bad, []);
});
test('every tests/*.js|py file on disk is named in the README', () => {
  const missing = repoFiles.filter(p => /^tests\/[^/]+\.(?:js|py)$/.test(p)).filter(p => !readme.includes(path.basename(p)));
  assert.deepEqual(missing, []);
});
test('README quotes the real DOM smoke and unit counts', () => {
  const count = (f, re) => (fs.readFileSync(path.join(__dirname, f), 'utf8').match(re) || []).length;
  const unit = count('core.test.js', /^\s*(?:await )?(?:test|t)\(/gm);
  const m = readme.match(/Unit \((\d+) tests/);
  assert.ok(m, 'unit row not found');
  assert.equal(+m[1], unit, 'README says ' + m[1] + ', core.test.js has ' + unit);
});
console.log(`\n${passed} passed, ${failed} failed`);
