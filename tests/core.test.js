// Unit tests for js/core.js (pure logic). Run: node tests/core.test.js  (no dependencies)
const assert = require('assert');
const C = require('../js/core.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (e) { failed++; console.log('✗ ' + name + '\n    ' + e.message); }
}
const demo = () => C.demoState('2026-10-10');

test('sample data is flagged, the flag survives backup/undo, and real data never gets it', () => {
  assert.strictEqual(demo().sample, true);
  assert.strictEqual(C.importState(JSON.stringify(demo())).sample, true);
  assert.strictEqual(C.emptyState().sample, undefined);
  const real = C.emptyState(); real.sample = 'yes';
  assert.strictEqual(C.importState(real).sample, undefined);
});

/* money */
test('reminder for a long backlog rolls older sessions into one line and keeps the total', () => {
  const st = C.emptyState(); st.profile.name = 'Aariv';
  const c = { id: 'c1', name: 'Ethan Brooks', rate: 30, parentName: 'Mrs. Brooks' }; st.clients.push(c);
  for (let i = 0; i < 40; i++) st.sessions.push({ id: 's' + i, clientId: 'c1', date: C.addDays('2026-08-01', i), minutes: 60, topics: 'fractions', notes: '', paid: false, volunteer: false });
  const msg = C.reminderMessage(st, 'c1');
  assert.ok(msg.includes('$1,200.00 for 40 sessions'), msg);
  assert.ok(/• 28 earlier sessions \(.* to .*\): \$840\.00/.test(msg), msg);
  assert.strictEqual(msg.split('\n').filter(l => l.startsWith('• ') && l.includes(' min')).length, 12);
  assert.ok(msg.length < 1500, 'stays short: ' + msg.length);
  const few = C.reminderMessage(st, 'c1').includes('earlier session');
  st.sessions = st.sessions.slice(0, 5);
  assert.ok(few && !C.reminderMessage(st, 'c1').includes('earlier session'));
});
test('exact half-cent amounts round up (5.02/hr x 15 min = $1.26), never down', () => {
  assert.strictEqual(C.sessionAmount({ minutes: 15 }, { rate: 5.02 }), 1.26);
  assert.strictEqual(C.sessionAmount({ minutes: 45 }, { rate: 5.02 }), 3.77);
  assert.strictEqual(C.sessionAmount({ minutes: 90 }, { rate: 5.05 }), 7.58);
  assert.strictEqual(C.cents(1.005), 1.01);
  assert.strictEqual(C.cents(0), 0);
});
test('money groups thousands with commas, keeps two decimals, and handles junk', () => {
  assert.strictEqual(C.money(1234.5), '$1,234.50');
  assert.strictEqual(C.money(1000000), '$1,000,000.00');
  assert.strictEqual(C.money(999.999), '$1,000.00');
  assert.strictEqual(C.money(115), '$115.00');
  assert.strictEqual(C.money(-5), '-$5.00');
  assert.strictEqual(C.money(undefined), '$0.00');
});
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

/* payment wording */
test('reminder and parent update name the payment app, never "pay by @handle"', () => {
  const st = demo();
  const r = C.reminderMessage(st, 'c_ethan');
  assert.ok(r.includes('You can pay with Venmo @aariv-tutoring.'), r);
  assert.ok(!/pay by @/.test(r));
  const u = C.progressReport(st, 'c_ethan');
  assert.ok(u.includes('You can pay with Venmo @aariv-tutoring.'), u);
  assert.ok(!/pay by @/.test(u));
});
test('payment app label is configurable', () => {
  assert.strictEqual(C.paymentText({ venmo: 'aariv@example.com', payMethod: 'Zelle' }), 'Zelle aariv@example.com');
  assert.strictEqual(C.paymentText({ venmo: '@x', payMethod: 'PayPal' }), 'PayPal @x');
  const st = demo(); st.profile.payMethod = 'Cash App'; st.profile.venmo = '$aariv';
  assert.ok(C.reminderMessage(st, 'c_ethan').includes('You can pay with Cash App $aariv.'));
});
test('blank payment app falls back to a sensible guess from the handle', () => {
  assert.strictEqual(C.paymentText({ venmo: '@aariv-tutoring' }), 'Venmo @aariv-tutoring');
  assert.strictEqual(C.paymentText({ venmo: '$aariv' }), 'Cash App $aariv');
  assert.strictEqual(C.paymentText({ venmo: 'tutor@example.com' }), 'Zelle tutor@example.com');
  assert.strictEqual(C.paymentText({ venmo: '(555) 123-4567' }), 'Zelle (555) 123-4567');
  assert.strictEqual(C.paymentText({ venmo: 'paypal.me/aariv' }), 'paypal.me/aariv', 'already names PayPal');
  assert.strictEqual(C.paymentSentence({ venmo: 'paypal.me/aariv' }), 'You can pay with paypal.me/aariv.');
  assert.strictEqual(C.paymentText({ venmo: 'cash at the session' }), 'cash at the session');
  assert.strictEqual(C.paymentText({ venmo: '' }), '');
  assert.strictEqual(C.paymentSentence({ venmo: '  ' }), '');
});
test('a handle that already names its app is not double-labelled', () => {
  assert.strictEqual(C.paymentText({ venmo: 'Zelle: tutor@example.com', payMethod: 'Venmo' }), 'Zelle: tutor@example.com');
  assert.strictEqual(C.paymentText({ venmo: 'Venmo @a', payMethod: 'Venmo' }), 'Venmo @a');
  assert.strictEqual(C.paymentSentence({ venmo: 'cash at the session' }), 'Payment: cash at the session.');
});
test('no handle means no payment line in either message', () => {
  const st = demo(); st.profile.venmo = '';
  assert.ok(!/pay with/i.test(C.reminderMessage(st, 'c_ethan')));
  assert.ok(!/pay with/i.test(C.progressReport(st, 'c_ethan')));
});

/* referral footer */
test('"Sent with TutorLoop" footer is off by default and in demo data', () => {
  assert.strictEqual(C.emptyState().profile.referralFooter, false);
  const st = demo();
  assert.ok(!C.reminderMessage(st, 'c_ethan').includes('Sent with TutorLoop'));
  assert.ok(!C.progressReport(st, 'c_maya').includes('Sent with TutorLoop'));
  assert.strictEqual(C.referralFooter(st.profile), '');
});
test('footer, when switched on, ends reminders and parent updates with a plain link', () => {
  const st = demo(); st.profile.referralFooter = true;
  const line = 'Sent with TutorLoop, a free app for student tutors: https://aariv.me/Tutorloop/';
  for (const msg of [C.reminderMessage(st, 'c_ethan'), C.progressReport(st, 'c_maya'), C.progressReport(st, 'c_sofia')]) {
    assert.ok(msg.endsWith('\n\n--\n' + line), msg.slice(-120));
    assert.ok(!/[?&](ref|utm_)/.test(msg), 'no tracking parameters');
  }
  assert.strictEqual(C.reminderMessage(st, 'c_sofia'), '', 'still empty when nothing is owed');
});
test('backup import keeps payment app and footer choice, and sanitises them', () => {
  const st = demo(); st.profile.payMethod = 'Zelle'; st.profile.referralFooter = true;
  const back = C.importState(JSON.stringify(st));
  assert.strictEqual(back.profile.payMethod, 'Zelle');
  assert.strictEqual(back.profile.referralFooter, true);
  const weird = C.importState({ profile: { payMethod: 'x'.repeat(99), referralFooter: 'yes' }, clients: [], sessions: [] });
  assert.strictEqual(weird.profile.payMethod.length, 30);
  assert.strictEqual(weird.profile.referralFooter, false, 'only a real true turns it on');
  const old = C.importState({ profile: { venmo: '@old' }, clients: [], sessions: [] });
  assert.strictEqual(old.profile.payMethod, '');
  assert.strictEqual(C.paymentText(old.profile), 'Venmo @old', 'old backups keep working');
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

/* monthly summary + Pro value */
test('summaryMonths lists months with sessions newest first and always includes the current month', () => {
  assert.deepStrictEqual(C.summaryMonths(demo(), '2026-10'), ['2026-10', '2026-09', '2026-08']);
  assert.deepStrictEqual(C.summaryMonths(C.emptyState(), '2026-10'), ['2026-10']);
});
test('monthSummary totals split paid vs volunteer tutoring and add up per student', () => {
  const m = C.monthSummary(demo(), '2026-09');
  assert.strictEqual(m.totals.sessions, 6);
  assert.strictEqual(m.totals.billed, 140); assert.strictEqual(m.totals.paid, 70); assert.strictEqual(m.totals.unpaid, 70);
  assert.strictEqual(m.totals.volunteerHours, 1.5); assert.strictEqual(m.totals.paidHours, 5);
  assert.strictEqual(m.students.length, 3);
  assert.strictEqual(C.cents(m.students.reduce((a, r) => a + r.billed, 0)), m.totals.billed);
  assert.deepStrictEqual(m.students.map(r => r.client.name), ['Ethan Brooks', 'Maya Chen', 'Sofia Ramirez']);
});
test('monthSummary for one student includes the all-time balance due', () => {
  const m = C.monthSummary(demo(), '2026-09', 'c_maya');
  assert.strictEqual(m.totals.sessions, 2); assert.strictEqual(m.totals.unpaid, 25); assert.strictEqual(m.balanceAll, 25);
  assert.strictEqual(C.monthSummary(demo(), '2026-09').balanceAll, null);
});
test('summaryText: family statement has the session log, balance, and payment sentence', () => {
  const t = C.summaryText(demo(), '2026-09', 'c_maya');
  assert.ok(t.startsWith('Hi Mrs. Chen,'), t);
  assert.ok(t.includes("Maya's Algebra 1 tutoring summary for September 2026"));
  assert.ok(t.includes('• Sep 22: 60 min (systems of equations, word problems), $25.00, unpaid'));
  assert.ok(t.includes('Total balance due today: $25.00. You can pay with Venmo @aariv-tutoring.'));
});
test('summaryText: whole-month recap covers service hours; empty month and volunteer-only student read correctly', () => {
  const s = demo();
  const all = C.summaryText(s, '2026-09');
  assert.ok(all.includes('Volunteer tutoring (service hours): 1.5 hours in 2 sessions'), all);
  assert.ok(all.includes('• Sofia Ramirez: 2 sessions, 1.5 hours, 1.5 volunteer hours'));
  assert.ok(C.summaryText(s, '2025-01').includes('No sessions were logged in January 2025.'));
  const sofia = C.summaryText(s, '2026-09', 'c_sofia');
  assert.ok(sofia.includes('Volunteer (no charge): 2 sessions') && !sofia.includes('balance'), sofia);
  s.profile.referralFooter = true;
  assert.ok(C.summaryText(s, '2026-09').endsWith('--\nSent with TutorLoop, a free app for student tutors: ' + C.APP_URL));
});
test('proValue expresses the Pro price in minutes at the tutor\'s average paid rate', () => {
  const s = C.emptyState();
  assert.strictEqual(C.proValue(s, 4), null);
  s.clients.push({ id: 'a', name: 'A', rate: 24 });
  s.sessions.push({ id: '1', clientId: 'a', date: '2026-10-01', minutes: 60 }, { id: '2', clientId: 'a', date: '2026-10-02', minutes: 60, volunteer: true });
  assert.deepStrictEqual(C.proValue(s, 4), { rate: 24, minutes: 10 });
});

/* part payments */
function payState() {
  const st = C.emptyState(); st.profile.name = 'Aariv'; st.profile.venmo = '@aariv'; st.profile.payMethod = 'Venmo';
  st.clients.push({ id: 'c1', name: 'Maya Chen', rate: 25, parentName: 'Mrs. Chen' }, { id: 'c2', name: 'Ethan', rate: 30 });
  // inserted out of date order on purpose: oldest-first must follow the date, not the array
  st.sessions.push(
    { id: 's2', clientId: 'c1', date: '2026-09-10', minutes: 60, topics: 'b', paid: false },
    { id: 's1', clientId: 'c1', date: '2026-09-03', minutes: 60, topics: 'a', paid: false },
    { id: 's3', clientId: 'c1', date: '2026-09-17', minutes: 60, topics: 'c', paid: false },
    { id: 'v1', clientId: 'c1', date: '2026-09-01', minutes: 60, topics: 'v', volunteer: true },
    { id: 'o1', clientId: 'c2', date: '2026-09-05', minutes: 60, topics: 'x', paid: false });
  return st;
}
const bal = (st, id) => C.balances(st).find(b => b.client.id === id);
test('partial payment settles the oldest session first and keeps the rest as a part payment', () => {
  const st = payState();
  const plan = C.planPayment(st, 'c1', 40);
  assert.ok(plan.ok, plan.error);
  assert.deepStrictEqual(plan.steps.map(x => [x.id, x.applied, x.settles]), [['s1', 25, true], ['s2', 15, false]]);
  assert.strictEqual(plan.owedBefore, 75); assert.strictEqual(plan.owedAfter, 35); assert.strictEqual(plan.settled, 1);
  C.applyPayment(st, 'c1', plan, '2026-10-11');
  assert.strictEqual(st.sessions.find(s => s.id === 's1').paid, true);
  assert.strictEqual(st.sessions.find(s => s.id === 's2').partPaid, 15);
  assert.strictEqual(st.sessions.find(s => s.id === 's3').partPaid, undefined);
  assert.strictEqual(bal(st, 'c1').owed, 35);
  assert.strictEqual(bal(st, 'c2').owed, 30, 'other families untouched');
  assert.deepStrictEqual(st.payments.map(p => [p.clientId, p.date, p.amount]), [['c1', '2026-10-11', 40]]);
});
test('part payments add up at cent precision and a final payment clears the balance exactly', () => {
  const st = payState(); st.clients[0].rate = 33.33;   // 33.33 an hour, 3 sessions: $99.99
  assert.strictEqual(bal(st, 'c1').owed, 99.99);
  for (const amt of [0.01, 0.1, 10.89, 33.33]) { const p = C.planPayment(st, 'c1', amt); assert.ok(p.ok, p.error); C.applyPayment(st, 'c1', p, '2026-10-11'); }
  const owed = bal(st, 'c1').owed;
  assert.strictEqual(owed, 55.66);
  assert.strictEqual(C.cents(99.99 - 0.01 - 0.1 - 10.89 - 33.33), owed);
  const last = C.planPayment(st, 'c1', owed); assert.ok(last.ok, last.error); C.applyPayment(st, 'c1', last, '2026-10-12');
  assert.strictEqual(bal(st, 'c1').owed, 0);
  assert.ok(st.sessions.filter(s => s.clientId === 'c1' && !s.volunteer).every(s => s.paid && s.partPaid === undefined));
  assert.strictEqual(C.cents(st.payments.reduce((a, p) => a + p.amount, 0)), 99.99);
});
test('payments are refused when empty, zero, negative, over the balance, or for nobody owing', () => {
  const st = payState();
  for (const bad of ['', null, 0, -5, 'abc', 0.001, NaN]) assert.strictEqual(C.planPayment(st, 'c1', bad).ok, false, String(bad));
  const over = C.planPayment(st, 'c1', 75.01);
  assert.strictEqual(over.ok, false); assert.ok(over.error.includes('$75.00'), over.error);
  assert.strictEqual(C.planPayment(st, 'c1', 75).ok, true);
  assert.strictEqual(C.planPayment(st, 'nope', 5).ok, false);
  st.sessions.forEach(s => { if (s.clientId === 'c1') s.paid = true; });
  assert.ok(C.planPayment(st, 'c1', 5).error.includes('Nothing is owed'));
  assert.strictEqual(C.planPayment(payState(), 'c1', 100001).ok, false);
});
test('planPayment is pure; the dashboard totals, reminder, invoice and monthly statement all use the part-paid amount', () => {
  const st = payState();
  const before = JSON.stringify(st);
  const plan = C.planPayment(st, 'c1', 40); assert.strictEqual(JSON.stringify(st), before);
  C.applyPayment(st, 'c1', plan, '2026-10-11');
  const s = C.stats(st, '2026-09');
  assert.strictEqual(s.earned, 105); assert.strictEqual(s.unpaid, 65); assert.strictEqual(s.collected, 40); assert.strictEqual(s.unpaidAll, 65);
  const msg = C.reminderMessage(st, 'c1');
  assert.ok(msg.includes("balance of $35.00 for 2 sessions"), msg);
  assert.ok(msg.includes('$10.00 left ($15.00 already paid of $25.00)'), msg);
  assert.ok(!msg.includes('Sep 3'), 'the settled session is not listed');
  const inv = C.invoice(st, 'c1', '2026-10-11');
  assert.strictEqual(inv.total, 35); assert.deepStrictEqual(inv.items.map(i => [i.id, i.amount, i.full, i.partPaid]), [['s2', 10, 25, 15], ['s3', 25, 25, 0]]);
  const m = C.monthSummary(st, '2026-09', 'c1');
  assert.strictEqual(m.balanceAll, 35); assert.strictEqual(m.totals.billed, 75); assert.strictEqual(m.totals.paid, 40); assert.strictEqual(m.totals.unpaid, 35);
  assert.ok(C.progressReport(st, 'c1', '2026-09-01', '2026-09-30').includes('$35.00'));
});
test('paid flag behavior is unchanged for old data, and editing a session down never makes a negative balance', () => {
  const st = payState();
  assert.strictEqual(C.sessionDue(st.sessions[0], st.clients[0]), 25);
  st.sessions[0].paid = true; assert.strictEqual(C.sessionDue(st.sessions[0], st.clients[0]), 0);
  const p = C.planPayment(st, 'c1', 10); C.applyPayment(st, 'c1', p, '2026-10-11');   // part-pays s1 (oldest unpaid)
  const part = st.sessions.find(s => s.partPaid);
  part.minutes = 12;   // now worth $5, less than the $10 already paid
  assert.strictEqual(C.sessionDue(part, st.clients[0]), 0);
  assert.ok(bal(st, 'c1').owed >= 0);
  part.paid = true; assert.strictEqual(C.sessionDue(part, st.clients[0]), 0);
});
test('part payments and the payment log survive backup, undo, and bad data is dropped', () => {
  const st = payState();
  C.applyPayment(st, 'c1', C.planPayment(st, 'c1', 40), '2026-10-11');
  const back = C.importState(JSON.stringify(st));
  assert.strictEqual(back.sessions.find(s => s.id === 's2').partPaid, 15);
  assert.strictEqual(back.sessions.find(s => s.id === 's1').partPaid, undefined);
  assert.strictEqual(back.payments.length, 1); assert.strictEqual(back.payments[0].amount, 40);
  assert.strictEqual(bal(back, 'c1').owed, 35);
  const messy = JSON.parse(JSON.stringify(st));
  messy.payments.push({ id: 'x', clientId: 'ghost', date: '2026-10-11', amount: 5 }, { id: 'y', clientId: 'c1', date: 'nope', amount: 5 }, { id: 'z', clientId: 'c1', date: '2026-10-11', amount: -3 }, null);
  messy.sessions.find(s => s.id === 's3').partPaid = -4; messy.sessions.find(s => s.id === 'v1').partPaid = 9;
  const clean = C.importState(JSON.stringify(messy));
  assert.strictEqual(clean.payments.length, 1);
  assert.strictEqual(clean.sessions.find(s => s.id === 's3').partPaid, undefined);
  assert.strictEqual(clean.sessions.find(s => s.id === 'v1').partPaid, undefined);
  assert.deepStrictEqual(C.importState(JSON.stringify({ clients: [], sessions: [] })).payments, [], 'an old backup has no payments');
});
test('CSV export carries the part-paid amount', () => {
  const st = payState(); C.applyPayment(st, 'c1', C.planPayment(st, 'c1', 40), '2026-10-11');
  const rows = C.sessionsCSV(st).split('\r\n');
  assert.ok(rows[0].endsWith(',Part paid'));
  assert.ok(rows.find(r => r.startsWith('2026-09-10')).endsWith(',15'), rows.join('|'));
  assert.ok(rows.find(r => r.startsWith('2026-09-03')).endsWith(',0'));
});

test('balances report the part-paid amount against the unpaid sessions ("$15.00 of $50.00 paid")', () => {
  const st = payState();
  assert.strictEqual(bal(st, 'c1').partPaid, 0); assert.strictEqual(bal(st, 'c1').unpaidBilled, 75);
  C.applyPayment(st, 'c1', C.planPayment(st, 'c1', 40), '2026-10-11');   // s1 settled, s2 part-paid $15
  const b = bal(st, 'c1');
  assert.strictEqual(b.partPaid, 15); assert.strictEqual(b.unpaidBilled, 50); assert.strictEqual(b.owed, 35);
  assert.strictEqual(bal(st, 'c2').partPaid, 0, 'other families untouched');
});
test('monthly family statement lists the payments received that month, and only that family and month', () => {
  const st = payState();
  C.applyPayment(st, 'c1', C.planPayment(st, 'c1', 10), '2026-09-20');
  C.applyPayment(st, 'c1', C.planPayment(st, 'c1', 12.5), '2026-09-28');
  C.applyPayment(st, 'c1', C.planPayment(st, 'c1', 5), '2026-10-02');
  C.applyPayment(st, 'c2', C.planPayment(st, 'c2', 7), '2026-09-21');
  const m = C.monthSummary(st, '2026-09', 'c1');
  assert.deepStrictEqual(m.payments.map(x => [x.date, x.amount]), [['2026-09-20', 10], ['2026-09-28', 12.5]]);
  assert.strictEqual(m.paymentsTotal, 22.5);
  const txt = C.summaryText(st, '2026-09', 'c1');
  assert.ok(txt.includes('Payments received in September 2026:\n• Sep 20: $10.00\n• Sep 28: $12.50\nTotal received: $22.50'), txt);
  const oct = C.summaryText(st, '2026-10', 'c1');
  assert.ok(oct.includes('There were no tutoring sessions') && oct.includes('Payments received in October 2026:\n• Oct 2: $5.00') && !oct.includes('Total received'), oct);
  assert.ok(!C.summaryText(payState(), '2026-09', 'c1').includes('Payments received'), 'no section without payments');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
