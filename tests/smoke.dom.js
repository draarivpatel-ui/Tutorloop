// Fast DOM smoke test with jsdom (no browser needed). Run: npm i && npm run test:dom
// Renders every route, drives the main forms, and checks XSS escaping and persistence.
// Real-browser checks (native validation, offline, layout, axe) live in tests/e2e.py.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const dir = path.join(__dirname, '..') + '/';

const html = fs.readFileSync(dir + 'index.html', 'utf8').replace(/<script src="[^"]+"[^>]*><\/script>/g, '');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.github.io/Tutorloop/' });
const w = dom.window;
w.HTMLCanvasElement.prototype.getContext = () => null;
w.confirm = () => true; w.scrollTo = () => {}; w.print = () => {};
w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
const errors = [];
w.addEventListener('error', e => errors.push(e.message));
w.eval(fs.readFileSync(dir + 'js/core.js', 'utf8'));
w.eval(fs.readFileSync(dir + 'js/app.js', 'utf8'));

const d = w.document;
const text = () => d.getElementById('app').textContent.replace(/\s+/g, ' ');
const go = h => { w.location.hash = h; w.dispatchEvent(new w.HashChangeEvent('hashchange')); };
const submit = f => f.dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
const saved = () => JSON.parse(w.localStorage.getItem('tutorloop.v1'));
let n = 0; const ok = (name, cond) => { assert.ok(cond, name); n++; console.log('✓ ' + name); };

ok('empty state renders onboarding with a quick-start form', text().includes('Or set up step by step') && !!d.getElementById('quickForm'));
// Quick start: one form creates the student and the first session, then shows what TutorLoop made.
const q = d.getElementById('quickForm');
submit(q);
ok('quick start requires a student name', d.querySelector('#quickForm .form-errors').textContent.includes('Student name is required'));
q.querySelector('[name=name]').value = 'Riya Shah'; q.querySelector('[name=topics]').value = 'fractions';
q.querySelector('[name=notes]').value = 'Improved on fractions';
d.querySelector('#quickForm [data-min="45"]').click();
submit(q);
ok('quick start saves one student and one 45-minute session', saved().clients.length === 1 && saved().sessions.length === 1 && saved().sessions[0].minutes === 45);
ok('first-run callout shows the drafted parent update and a $18.75 invoice', !!d.querySelector('.firstrun') && text().includes('Riya is making clear progress') && text().includes('$18.75'));
// Toast: has a close button, and closing removes it completely (hidden + emptied), not just faded out.
const toastBox = d.getElementById('toast');
ok('toast shows with Undo and a close button', toastBox.classList.contains('show') && !toastBox.hidden && !!toastBox.querySelector('.toast-close') && !!toastBox.querySelector('.toast-undo'));
toastBox.querySelector('.toast-close').click();
ok('closing the toast hides it right away', !toastBox.classList.contains('show'));
go('settings');
d.querySelector('[data-act=demo]').click();
ok('sample data loads into the dashboard', text().includes('Who owes you') && text().includes('$115.00'));

for (const r of ['log', 'students', 'reports', 'invoices', 'hours', 'settings', 'about']) {
  go(r);
  ok('route #' + r + ' renders a heading', !!d.querySelector('#app h1'));
}

go('about');
ok('pitch page is honest about traction', text().includes('No paying customers yet') && text().includes('Checkout in the app is a simulation'));
ok('pitch page fee math matches published Stripe rates', text().includes('$0.44') && text().includes('$3.56') && text().includes('$95.14'));

go('reports');
ok('parent update auto-generates', d.getElementById('reportOut').value.startsWith('Hi Mrs. Chen,'));

go('students');
const f = d.getElementById('clientForm');
f.querySelector('[name=name]').value = 'Test Kid'; f.querySelector('[name=rate]').value = '20';
submit(f);
ok('free plan blocks a 4th student', d.querySelector('.form-errors').textContent.includes('Free plan includes 3'));

go('log');
const s = d.getElementById('sessionForm');
s.querySelector('[name=minutes]').value = '45';
s.querySelector('[name=topics]').value = 'fractions, <img src=x onerror=alert(1)>';
submit(s);
go('dashboard');
ok('user input is escaped in the DOM (XSS)', !d.querySelector('#app img') && d.getElementById('app').innerHTML.includes('&lt;img'));
ok('new session persisted to localStorage', saved().sessions.length === 13);

d.querySelector('[data-act=markPaidAll]').click();
ok('mark paid persists', saved().sessions.filter(x => x.clientId === 'c_ethan' && !x.paid).length === 0);
d.querySelector('.toast-undo').click();
ok('undo restores the previous state', saved().sessions.filter(x => x.clientId === 'c_ethan' && !x.paid).length === 2);

const lastMonth = (() => { const t = new Date(); t.setDate(1); t.setMonth(t.getMonth() - 1); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0'); })();
const st = () => w.TutorCore.importState(w.localStorage.getItem('tutorloop.v1'));
go('summary/' + lastMonth + '/c_maya');
ok('monthly summary renders a family statement', text().includes('Maya Chen: tutoring summary') && text().includes(w.TutorCore.fmtMonth(lastMonth)) && d.getElementById('summaryText').value.startsWith('Hi Mrs. Chen,'));
go('summary/' + lastMonth);
ok('monthly summary for all students totals the month', text().includes('Ethan Brooks') && text().includes(w.TutorCore.money(w.TutorCore.monthSummary(st(), lastMonth).totals.billed)));
go('settings');
ok('settings shows plan usage and Pro in minutes of tutoring', text().includes('3 of 3') && /about \d+ minutes of tutoring/.test(text()));

go('invoices/does-not-exist');
ok('unknown invoice id does not crash', text().includes('not found'));

// Escape dismisses a toast, and after the fade it is fully removed (hidden + emptied).
go('reports');
submit(d.getElementById('reportForm'));
ok('a plain toast is showing', toastBox.classList.contains('show') && toastBox.textContent.includes('Update generated') && !toastBox.querySelector('.toast-undo'));
d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
ok('Escape dismisses the toast', !toastBox.classList.contains('show'));
setTimeout(() => {
  ok('a dismissed toast is removed from the page (hidden, no leftover Undo button)', toastBox.hidden && toastBox.innerHTML === '');
  ok('no uncaught errors', errors.length === 0);
  console.log(`\n${n} DOM checks passed`);
}, 400);
