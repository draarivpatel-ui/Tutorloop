const assert = require('assert');
(async () => {
  const fs = require('fs'), path = require('path'), vm = require('vm');
  const src = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const handlers = {}; const deleted = []; let skipped = false, claimed = false, opened = null;
  const caches = {
    keys: async () => ['tutorloop-v1', 'tutorloop-v12', 'other-app-v3'],
    delete: async k => { deleted.push(k); return true; },
    open: async n => { opened = n; return { addAll: async files => { caches.files = files; } }; }
  };
  const self = { location: { href: 'https://aariv.me/Tutorloop/sw.js' }, addEventListener: (n, f) => { handlers[n] = f; },
    skipWaiting: () => { skipped = true; }, clients: { claim: () => { claimed = true; } } };
  vm.runInNewContext(src, { self, caches, URL, Response: class {} });
  const run = async n => { let p; handlers[n]({ waitUntil: x => { p = x; } }); await p; };
  await run('install'); await run('activate');{
    assert.strictEqual(opened, 'tutorloop-v12');
    for (const f of caches.files) assert.ok(fs.existsSync(path.join(__dirname, '..', f === './' ? 'index.html' : f)), f + ' missing');
    assert.ok(skipped && claimed);
    assert.deepStrictEqual(deleted, ['tutorloop-v1']);
  }
console.log('✓ service worker: shell files exist, old tutorloop caches pruned, others untouched');
})().catch(e => { console.log('✗ sw: ' + e.message); process.exit(1); });
