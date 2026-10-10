// Unit tests for js/core.js (pure logic). Run: node tests/core.test.js  (no dependencies)
const assert = require('assert');
const C = require('../js/core.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (e) { failed++; console.log('✗ ' + name + '\n    ' + e.message); }
}
const demo = () => C.demoState('2026-10-10');

/* money */
test('session amount uses student rate and minutes', () => {
  assert.strictEqual(C.sessionAmount({ minutes: 90 }, { rate: 30 }), 45);
});
test('rate override wins over student rate, including a $0 override', () => {
  assert.strictEqual(C.sessionAmount({ minutes: 60, rate: 40 }, { rate: 25 }), 40);
  assert.strictEqual(C.sessionAmount({ minutes: 60, rate: 0 }, { rate: 25 }), 0);
  assert.strictEqual(C.sessionAmount({ minutes: 60, rate: null }, { rate: 25 }), 25);
});
test('volunteer sessions are $0', () => {
  assert.strictEqual(C.sessionAmount({ minutes: 60, volunteer: true }, { rate: 25 }), 0);
});
test('cents rounding avoids float drift', () => {
  assert.strictEqual(C.sessionAmount({ minutes: 20 }, { rate: 25 }), 8.33);
  assert.strictEqual(C.money(0.1 + 0.2), '$0.30');
});
test('missing client or bad rate never produces NaN', () => {
  assert.strictEqual(C.sessionAmount({ minutes: 60 }, null), 0);
  assert.strictEqual(C.sessionAmount({ minutes: 60 }, { rate: 'abc' }), 0);
});

/* validation */
test('session validation catches missing fields', () => {
  assert.ok(C.validateSession({}).length >= 3);
  assert.deepStrictEqual(C.validateSession({ clientId: 'c', date: '2026-10-01', minutes: 60 }), []);
});
test('session validation rejects impossible dates, bad minutes, and bad rate overrides', () => {
  assert.ok(C.validateSession({ clientId: 'c', date: '2026-02-31', minutes: 60 }).some(e => /date/i.test(e)));
  assert.ok(C.validateSession({ clientId: 'c', date: '2026-10-01', minutes: 601 }).length === 1);
  assert.ok(C.validateSession({ clientId: 'c', date: '2026-10-01', minutes: NaN }).length === 1);
  assert.ok(C.validateSession({ clientId: 'c', date: '2026-10-01', minutes: 60, rate: -5 }).length === 1);
  assert.deepStrictEqual(C.validateSession({ clientId: 'c', date: '2026-10-01', minutes: 52, rate: 22.5 }), []);
});
test('isValidDate handles leap years', () => {
  assert.ok(C.isValidDate('2028-02-29'));
  assert.ok(!C.isValidDate('2026-02-29'));
  assert.ok(!C.isValidDate('2026-13-01'));
  assert.ok(!C.isValidDate('<script>'));
});
test('free plan blocks a 4th active student; archived students free a slot; Pro is unlimited', () => {
  const s = demo();
  assert.strictEqual(s.clients.length, 3);
  assert.ok(C.validateClient({ name: 'New', rate: 20 }, s).some(e => e.includes('Free plan')));
  s.clients[2].archived = true;
  assert.deepStrictEqual(C.validateClient({ name: 'New', rate: 20 }, s), []);
  s.clients[2].archived = false; s.profile.plan = 'pro';
  assert.deepStrictEqual(C.validateClient({ name: 'New', rate: 20 }, s), []);
});
test('client validation: name, rate range, email', () => {
  const errs = C.validateClient({ name: ' ', rate: -1, parentEmail: 'nope' });
  assert.strictEqual(errs.length, 3);
  assert.deepStrictEqual(C.validateClient({ id: 'x', name: 'A', rate: 0 }), []);
});

/* stats */
test('stats split earned, collected, unpaid, volunteer hours', () => {
  const s = demo();
  const all = C.stats(s);
  assert.strictEqual(C.cents(all.collected + all.unpaid), all.earned);
  assert.strictEqual(all.volunteerAll, 2.25); // 3 x 45 min
  // unpaid: Maya 1x$25 + Ethan 2x$45 = 115
  assert.strictEqual(all.unpaidAll, 115);
});
test('monthly stats only count that month', () => {
  const s = C.emptyState();
  s.clients.push({ id: 'a', name: 'A', rate: 20 });
  s.sessions.push({ id: '1', clientId: 'a', date: '2026-09-30', minutes: 60, paid: true });
  s.sessions.push({ id: '2', clientId: 'a', date: '2026-10-01', minutes: 30, paid: false });
  const oct = C.stats(s, '2026-10');
  assert.strictEqual(oct.earned, 10); assert.strictEqual(oct.collected, 0); assert.strictEqual(oct.sessions, 1);
  assert.strictEqual(oct.unpaidAll, 10);
});
test('balances sorted by most owed with unpaid count and oldest unpaid date', () => {
  const b = C.balances(demo());
  assert.strictEqual(b[0].client.name, 'Ethan Brooks');
  assert.strictEqual(b[0].owed, 90);
  assert.strictEqual(b[0].unpaidSessions, 2);
  assert.strictEqual(b[0].oldestUnpaid, '2026-09-29');
});
test('monthly series returns n months ending at given month, across a year boundary', () => {
  const m = C.monthlySeries(demo(), '2026-10', 6);
  assert.strictEqual(m.length, 6);
  assert.strictEqual(m[5].month, '2026-10');
  assert.strictEqual(m[0].month, '2026-05');
  assert.strictEqual(C.monthlySeries(C.emptyState(), '2027-02', 3)[0].month, '2026-12');
});
test('service-hour progress toward a goal', () => {
  const s = demo();
  assert.deepStrictEqual(C.serviceProgress(s), { hours: 2.25, goal: 10, pct: 23, remaining: 7.75 });
  s.profile.serviceGoal = 2;
  assert.strictEqual(C.serviceProgress(s).pct, 100);
  s.profile.serviceGoal = '';
  assert.strictEqual(C.serviceProgress(s).goal, 0);
});
test('lastSession returns the most recent session for repeat-logging', () => {
  assert.strictEqual(C.lastSession(demo(), 'c_ethan').date, '2026-10-08');
  assert.strictEqual(C.lastSession(demo(), 'nobody'), null);
});
test('range presets', () => {
  assert.deepStrictEqual(C.rangePreset('last30', '2026-10-10'), { from: '2026-09-11', to: '2026-10-10' });
  assert.deepStrictEqual(C.rangePreset('month', '2026-10-10'), { from: '2026-10-01', to: '2026-10-10' });
  assert.deepStrictEqual(C.rangePreset('all', '2026-10-10'), { from: '', to: '' });
});

/* NLG */
test('sentiment uses whole words, not substrings', () => {
  assert.deepStrictEqual(C.sentiment('hardly any trouble'.replace('trouble', 'issues')), { pos: 0, neg: 0 });
  assert.deepStrictEqual(C.sentiment('a greater number of problems'), { pos: 0, neg: 0 });
  assert.strictEqual(C.sentiment('this was hard').neg, 1);
});
test('sentiment handles negation both ways', () => {
  assert.deepStrictEqual(C.sentiment('not confident yet'), { pos: 0, neg: 1 });
  assert.deepStrictEqual(C.sentiment("wasn't confused at all"), { pos: 1, neg: 0 });
  assert.deepStrictEqual(C.sentiment('not very confident'), { pos: 0, neg: 1 });
});
test('sentiment counts "needs more review" once', () => {
  assert.strictEqual(C.sentiment('needs more review').neg, 1);
});
test('progress report mentions topics, trend, highlight, and balance', () => {
  const r = C.progressReport(demo(), 'c_maya', '2026-09-01', '2026-10-10');
  assert.ok(r.startsWith('Hi Mrs. Chen,'));
  assert.ok(/word problems/i.test(r));
  assert.ok(r.includes('Maya is making progress, and earlier challenges are turning around.'));
  assert.ok(r.includes('• Highlight: Improved a lot on word problems'));
  assert.ok(!r.includes('needs review on setup'), 'should not quote a struggle the student already turned around');
  assert.ok(r.includes('Balance for these sessions: $25.00'));
  assert.ok(r.includes('@aariv-tutoring'));
});
test('progress report flags the next focus when the latest note is a struggle', () => {
  const s = demo();
  s.sessions.push({ id: 'x', clientId: 'c_maya', date: '2026-10-10', minutes: 60, topics: 'quadratics', notes: 'confused by factoring, needs more practice', paid: true });
  const r = C.progressReport(s, 'c_maya', '2026-10-01', '2026-10-10');
  assert.ok(r.includes('• Next focus: Confused by factoring, needs more practice.'));
});
test('progress report handles empty period and single session', () => {
  assert.ok(C.progressReport(demo(), 'c_maya', '2020-01-01', '2020-01-31').includes('No sessions'));
  const one = C.progressReport(demo(), 'c_ethan', '2026-10-08', '2026-10-08');
  assert.ok(one.includes('tutoring on Oct 8.'));
  assert.ok(one.includes('1.5 hours total'));
  assert.strictEqual(C.progressReport(demo(), 'missing'), '');
});
test('payment reminder lists unpaid sessions and total, empty when nothing owed', () => {
  const r = C.reminderMessage(demo(), 'c_ethan');
  assert.ok(r.includes('balance of $90.00 for 2 sessions'));
  assert.ok(r.includes('• Sep 29: 90 min (geometry, area), $45.00'));
  assert.strictEqual(C.reminderMessage(demo(), 'c_sofia'), '');
});

/* invoices & CSV */
test('invoice totals unpaid non-volunteer sessions only, with a stable number', () => {
  const s = demo();
  const inv = C.invoice(s, 'c_ethan', '2026-10-10');
  assert.strictEqual(inv.total, 90);
  assert.ok(/^INV-20261010-[0-9A-Z]{4}$/.test(inv.number));
  assert.strictEqual(C.invoice(s, 'c_ethan', '2026-10-10').number, inv.number);
  assert.strictEqual(C.invoice(s, 'c_sofia').items.length, 0);
  assert.strictEqual(C.invoice(s, 'nope'), null);
});
test('CSV escapes commas, quotes, newlines and adds a total row', () => {
  const csv = C.volunteerCSV(demo());
  const lines = csv.split('\r\n');
  assert.strictEqual(lines.length, 5); // header + 3 + total
  assert.ok(csv.includes('"proofs, congruence"'));
  assert.ok(lines[4].startsWith('Total,,,,2.25'));
  assert.strictEqual(C.csvEscape('say "hi"'), '"say ""hi"""');
  assert.strictEqual(C.csvEscape('a\nb'), '"a\nb"');
});
test('CSV neutralises spreadsheet formula injection', () => {
  assert.strictEqual(C.csvEscape('=HYPERLINK("http://evil")'), '"\'=HYPERLINK(""http://evil"")"');
  assert.strictEqual(C.csvEscape('+1'), "'+1");
  assert.strictEqual(C.csvEscape('@SUM(A1)'), "'@SUM(A1)");
  assert.strictEqual(C.csvEscape(-5), '-5'); // real numbers are left alone
});

/* import */
test('import rejects junk with friendly messages and accepts a backup', () => {
  assert.throws(() => C.importState('{"foo":1}'), /not a TutorLoop backup/);
  assert.throws(() => C.importState('not json'), /not valid JSON/);
  assert.throws(() => C.importState({ version: 99, clients: [], sessions: [] }), /newer version/);
  const s = demo();
  const back = C.importState(JSON.stringify(s));
  assert.strictEqual(back.sessions.length, s.sessions.length);
  assert.deepStrictEqual(C.stats(back), C.stats(s));
});
test('import normalises types and drops orphans, duplicates, and bad rows', () => {
  const back = C.importState({
    profile: { plan: 'enterprise', name: 7 },
    clients: [{ id: 'a', name: 'A', rate: '20' }, { id: 'a', name: 'Dup' }, { name: 'no id' }],
    sessions: [
      { id: '1', clientId: 'a', date: '2026-10-01', minutes: '60', paid: 'yes' },
      { id: '1', clientId: 'a', date: '2026-10-02', minutes: 60 },
      { id: '2', clientId: 'ghost', date: '2026-10-01', minutes: 60 },
      { id: '3', clientId: 'a', date: '2026-02-31', minutes: 60 },
      { id: '4', clientId: 'a', date: '2026-10-01', minutes: -5 }
    ]
  });
  assert.strictEqual(back.profile.plan, 'free');
  assert.strictEqual(back.profile.name, '7');
  assert.strictEqual(back.clients.length, 1);
  assert.strictEqual(back.clients[0].rate, 20);
  assert.strictEqual(back.sessions.length, 1);
  assert.strictEqual(back.sessions[0].minutes, 60);
  assert.strictEqual(back.sessions[0].paid, true);
});
test('trend is recency-weighted: an old struggle does not outweigh recent wins', () => {
  const s = C.emptyState();
  s.clients.push({ id: 'a', name: 'Ann Lee', rate: 20 });
  const add = (id, d, notes) => s.sessions.push({ id, clientId: 'a', date: d, minutes: 60, notes });
  add('1', '2026-09-01', 'confused, struggled a lot, needs review, made mistakes');
  add('2', '2026-09-08', 'better');
  add('3', '2026-09-15', 'confident');
  const r = C.progressReport(s, 'a');
  assert.ok(r.includes('Ann is making progress, and earlier challenges are turning around.'), r);
  s.sessions.push({ id: '4', clientId: 'a', date: '2026-09-22', minutes: 60, notes: 'stuck on fractions' });
  s.sessions.push({ id: '5', clientId: 'a', date: '2026-09-29', minutes: 60, notes: 'still confused' });
  assert.ok(C.progressReport(s, 'a').includes('working through some challenging material'));
});
test('fmtDate adds the year only when needed', () => {
  assert.strictEqual(C.fmtDate('2026-10-08', 2026), 'Oct 8');
  assert.strictEqual(C.fmtDate('2025-12-30', 2026), 'Dec 30, 2025');
  assert.strictEqual(C.fmtDate('2026-10-08', true), 'Oct 8, 2026');
  assert.strictEqual(C.fmtDate('bad'), '');
});
test('plural helper', () => {
  assert.strictEqual(C.plural(1, 'family', 'families'), '1 family');
  assert.strictEqual(C.plural(2, 'family', 'families'), '2 families');
  assert.strictEqual(C.plural(0, 'session'), '0 sessions');
});
test('performance: stats and balances over 5,000 sessions stay fast', () => {
  const s = C.emptyState();
  for (let i = 0; i < 50; i++) s.clients.push({ id: 'c' + i, name: 'S' + i, rate: 20 + i });
  for (let i = 0; i < 5000; i++) s.sessions.push({ id: 's' + i, clientId: 'c' + (i % 50), date: C.addDays('2026-10-10', -(i % 365)), minutes: 60, paid: i % 3 === 0, volunteer: i % 10 === 0 });
  const t = Date.now();
  C.stats(s, '2026-10'); C.balances(s); C.monthlySeries(s, '2026-10', 6); C.progressReport(s, 'c1', '', '');
  const ms = Date.now() - t;
  assert.ok(ms < 1500, 'took ' + ms + 'ms');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
