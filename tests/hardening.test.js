// Hardening tests for js/core.js + import/export edges. Run: node tests/hardening.test.js (no dependencies)
// Covers: non-finite numbers in hand-edited backups, formula-safe CSV, atomic import,
// stale payment plans, invoice/ledger cent precision, and validation boundaries.
const assert = require('assert');
const C = require('../js/core.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (e) { failed++; console.log('✗ ' + name + '\n    ' + e.message); }
}
const base = () => {
  const st = C.emptyState();
  st.clients.push({ id: 'a', name: 'Ada Lovelace', rate: 25 });
  return st;
};

/* ---------- non-finite / hostile numbers in a hand-edited backup ---------- */
test('import: a rate of 1e309 (JSON Infinity) imports as 0, never Infinity', () => {
  const b = C.importState({ clients: [{ id: 'x', name: 'X', rate: 1e309 }], sessions: [] });
  assert.strictEqual(b.clients[0].rate, 0);
  assert.strictEqual(C.money(C.sessionAmount({ minutes: 60 }, b.clients[0])), '$0.00');
});
test('import: client rate clamps to the same $0-$1,000 range the form enforces', () => {
  const b = C.importState({ clients: [{ id: 'x', name: 'X', rate: 5000 }], sessions: [] });
  assert.strictEqual(b.clients[0].rate, 1000);
  const neg = C.importState({ clients: [{ id: 'x', name: 'X', rate: -50 }], sessions: [] });
  assert.strictEqual(neg.clients[0].rate, 0);
});
test('import: session rate override of 1e309 becomes null (student rate used), not Infinity', () => {
  const b = C.importState({
    clients: [{ id: 'c', name: 'C', rate: 25 }],
    sessions: [{ id: 's', clientId: 'c', date: '2026-10-01', minutes: 60, rate: 1e309 }]
  });
  assert.strictEqual(b.sessions[0].rate, null);
  assert.strictEqual(C.sessionAmount(b.sessions[0], b.clients[0]), 25);
});
test('import: session rate override above $1,000 clamps like the form', () => {
  const b = C.importState({
    clients: [{ id: 'c', name: 'C', rate: 25 }],
    sessions: [{ id: 's', clientId: 'c', date: '2026-10-01', minutes: 60, rate: 99999 }]
  });
  assert.strictEqual(b.sessions[0].rate, 1000);
});
test('import: an Infinity part payment can never mint a million-dollar credit', () => {
  const b = C.importState({
    clients: [{ id: 'c', name: 'C', rate: 25 }],
    sessions: [{ id: 's1', clientId: 'c', date: '2026-10-01', minutes: 60, partPaid: 1e309 },
               { id: 's2', clientId: 'c', date: '2026-10-02', minutes: 60 }]
  });
  assert.strictEqual(b.sessions[0].partPaid, undefined);
  assert.strictEqual(b.sessions[1].partPaid, undefined);
  assert.strictEqual(C.balances(b)[0].owed, 50, 'both sessions still owe in full');
});
test('import: an Infinity held payment drops instead of reappearing on Mark unpaid', () => {
  const b = C.importState({
    clients: [{ id: 'c', name: 'C', rate: 25 }],
    sessions: [{ id: 's', clientId: 'c', date: '2026-10-01', minutes: 60, paid: true, heldPaid: 1e309 }]
  });
  assert.strictEqual(b.sessions[0].heldPaid, undefined);
});
test('import: payments with non-finite or non-positive amounts are dropped', () => {
  const b = C.importState({
    clients: [{ id: 'c', name: 'C', rate: 25 }], sessions: [],
    payments: [{ id: 'p1', clientId: 'c', date: '2026-10-01', amount: 1e309 },
               { id: 'p2', clientId: 'c', date: '2026-10-01', amount: 'ten' },
               { id: 'p3', clientId: 'c', date: '2026-10-01', amount: 0 },
               { id: 'p4', clientId: 'c', date: '2026-10-01', amount: 12.5 }]
  });
  assert.strictEqual(b.payments.length, 1);
  assert.strictEqual(b.payments[0].amount, 12.5);
});
test('import: a payment is capped at $1,000,000 and cent-rounded', () => {
  const b = C.importState({
    clients: [{ id: 'c', name: 'C', rate: 25 }], sessions: [],
    payments: [{ id: 'p', clientId: 'c', date: '2026-10-01', amount: 5e9 + 0.999 }]
  });
  assert.strictEqual(b.payments[0].amount, 1e6);
});
test('import: a non-finite service goal is blank, not Infinity hours', () => {
  const b = C.importState({ profile: { serviceGoal: 1e309 }, clients: [], sessions: [] });
  assert.strictEqual(b.profile.serviceGoal, '');
});
test('import: a non-finite minutes value drops the session', () => {
  const b = C.importState({
    clients: [{ id: 'c', name: 'C', rate: 25 }],
    sessions: [{ id: 's', clientId: 'c', date: '2026-10-01', minutes: 1e309 },
               { id: 'ok', clientId: 'c', date: '2026-10-01', minutes: 60 }]
  });
  assert.strictEqual(b.sessions.length, 1);
});
test('money(): NaN, Infinity and -Infinity never print as "$NaN.undefined"', () => {
  assert.strictEqual(C.money(NaN), '$0.00');
  assert.strictEqual(C.money(Infinity), '$0.00');
  assert.strictEqual(C.money(-Infinity), '$0.00');
  assert.strictEqual(C.money('junk'), '$0.00');
});
test('money(): negative zero and sub-half-cent negatives never print "-$0.00"', () => {
  assert.strictEqual(C.money(-0.004), '$0.00');
  assert.strictEqual(C.money(-0.005), '$0.00');  // -0.5 cent rounds to -0, prints clean
  assert.strictEqual(C.money(-0.006), '-$0.01');
});

/* ---------- formula-safe CSV ---------- */
test('csvEscape: every OWASP injection prefix gets a leading apostrophe', () => {
  for (const ch of ['=', '+', '-', '@', '\t', '\r']) {
    const out = C.csvEscape(ch + 'CMD');
    const inner = out.startsWith('"') ? out.slice(1, -1) : out;  // \r/\n also get quoted
    assert.ok(inner.startsWith("'"), JSON.stringify(ch) + ' -> ' + JSON.stringify(out));
  }
});
test('csvEscape: injection inside quotes is neutralised before quoting', () => {
  assert.strictEqual(C.csvEscape('=2+5'), "'=2+5");
  assert.strictEqual(C.csvEscape('=cmd(), "x"'), '"\'=cmd(), ""x"""');
  assert.strictEqual(C.csvEscape('\t=1+1'), "'\t=1+1");
});
test('csvEscape: a real negative number stays a number cell', () => {
  assert.strictEqual(C.csvEscape(-12.5), '-12.5');
  assert.strictEqual(C.csvEscape(0), '0');
});
test('csvEscape: a string that only looks numeric still gets the prefix', () => {
  assert.strictEqual(C.csvEscape('-12.5'), "'-12.5");
  assert.strictEqual(C.csvEscape('+15551234567'), "'+15551234567");
});
test('sessionsCSV: hostile names, topics and notes cannot break columns or run formulas', () => {
  const st = base();
  st.clients[0].name = '=SUM(A1:A9) "Evil"\nLine2';
  st.sessions.push({ id: 's', clientId: 'a', date: '2026-10-01', minutes: 60, topics: '=1+1, ok', notes: '@mention\r=2' });
  const rows = C.sessionsCSV(st).split('\r\n');
  assert.strictEqual(rows.length, 2);
  const data = rows[1];
  assert.ok(data.includes('\'=SUM(A1:A9) ""Evil""\nLine2'), data);
  assert.ok(data.includes('\'=1+1, ok'));
  assert.ok(data.includes('\'@mention\r=2'));
});
test('volunteerCSV: a student named like a formula cannot run one either', () => {
  const st = base();
  st.clients[0].name = '@HYPERLINK("http://x")';
  st.sessions.push({ id: 's', clientId: 'a', date: '2026-10-01', minutes: 45, volunteer: true });
  const csv = C.volunteerCSV(st);
  assert.ok(csv.includes("'@HYPERLINK"));
});
test('CSV rows are CRLF-separated and the total row sums exactly', () => {
  const st = base();
  st.sessions.push({ id: 'a', clientId: 'a', date: '2026-10-01', minutes: 45, volunteer: true },
                   { id: 'b', clientId: 'a', date: '2026-10-02', minutes: 15, volunteer: true });
  const csv = C.volunteerCSV(st);
  assert.ok(csv.includes('\r\n'));
  assert.strictEqual(csv.split('\r\n').pop(), 'Total,,,,1,');
});
test('sessionsCSV: every session gets exactly one row, sorted by date', () => {
  const st = base();
  st.sessions.push({ id: '2', clientId: 'a', date: '2026-10-05', minutes: 30 },
                   { id: '1', clientId: 'a', date: '2026-10-01', minutes: 60 });
  const rows = C.sessionsCSV(st).split('\r\n');
  assert.strictEqual(rows[1].startsWith('2026-10-01'), true);
  assert.strictEqual(rows[2].startsWith('2026-10-05'), true);
});

/* ---------- atomic import ---------- */
test('a rejected backup throws and leaves a caller holding valid data untouched', () => {
  const good = C.demoState('2026-10-10');
  const keep = JSON.stringify(good);
  for (const bad of ['', '   ', '[]', 'null', '42', '"x"', '{"sessions":[]}', '{"clients":[]}', '{bad json', '{"version":99,"clients":[],"sessions":[]}']) {
    let threw = false;
    try { C.importState(bad); } catch (e) { threw = true; }
    assert.ok(threw, 'accepted: ' + JSON.stringify(bad).slice(0, 40));
    assert.strictEqual(JSON.stringify(good), keep);
  }
});
test('importState never mutates its input', () => {
  const src = { clients: [{ id: 'c', name: 'C', rate: '30' }], sessions: [{ id: 's', clientId: 'c', date: '2026-10-01', minutes: '60', partPaid: -3 }] };
  const snap = JSON.stringify(src);
  C.importState(src);
  assert.strictEqual(JSON.stringify(src), snap);
});
test('import: nulls, arrays-as-objects, and wrong-typed containers are refused cleanly', () => {
  for (const bad of [{ clients: {}, sessions: [] }, { clients: [], sessions: {} }, { clients: null, sessions: [] }]) {
    assert.throws(() => C.importState(bad), /not a TutorLoop backup/);
  }
});
test('import: sessions referencing deleted, duplicate or blank students are dropped', () => {
  const b = C.importState({
    clients: [{ id: 'c', name: 'C', rate: 25 }],
    sessions: [{ id: 's1', clientId: 'ghost', date: '2026-10-01', minutes: 60 },
               { id: 's2', clientId: null, date: '2026-10-01', minutes: 60 },
               { id: 's3', clientId: 'c', date: '2026-10-01', minutes: 60 }]
  });
  assert.deepStrictEqual(b.sessions.map(s => s.id), ['s3']);
});
test('import: string ids are normalised so "5" and 5 are the same id', () => {
  const b = C.importState({
    clients: [{ id: 5, name: 'N', rate: 10 }, { id: '5', name: 'Dup' }],
    sessions: [{ id: 's', clientId: '5', date: '2026-10-01', minutes: 60 }]
  });
  assert.strictEqual(b.clients.length, 1);
  assert.strictEqual(b.sessions.length, 1);
});
test('import: an empty file shape still yields a complete state object', () => {
  const b = C.importState({ clients: [], sessions: [] });
  assert.deepStrictEqual(Object.keys(b.profile), Object.keys(C.emptyState().profile));
  assert.deepStrictEqual(b.payments, []);
});
test('import is idempotent: importing an import changes nothing further', () => {
  const once = C.importState(C.demoState('2026-10-10'));
  const twice = C.importState(JSON.parse(JSON.stringify(once)));
  assert.deepStrictEqual(twice, once);
});

/* ---------- ledger precision ---------- */
test('session amount at the boundaries: $1,000/hr and 600 min stay exact', () => {
  assert.strictEqual(C.sessionAmount({ minutes: 600 }, { rate: 1000 }), 10000);
  assert.strictEqual(C.sessionAmount({ minutes: 1 }, { rate: 1000 }), 16.67);
});
test('dueTotal and invoice agree to the cent across many tiny part payments', () => {
  const st = base();
  for (let i = 0; i < 7; i++) st.sessions.push({ id: 's' + i, clientId: 'a', date: '2026-10-0' + (i + 1), minutes: 33, rate: 33.33 });
  const plan = C.planPayment(st, 'a', 37.01);
  C.applyPayment(st, 'a', plan, '2026-10-10');
  const inv = C.invoice(st, 'a', '2026-10-10');
  assert.strictEqual(C.balances(st)[0].owed, inv.total);
  assert.strictEqual(C.cents(7 * C.sessionAmount({ minutes: 33, rate: 33.33 }, st.clients[0]) - 37.01), inv.total);
});
test('invoice number is stable for identical data and changes with the items', () => {
  const st = base();
  st.sessions.push({ id: 's', clientId: 'a', date: '2026-10-01', minutes: 60 });
  const n1 = C.invoice(st, 'a', '2026-10-10').number;
  assert.strictEqual(C.invoice(st, 'a', '2026-10-10').number, n1);
  st.sessions.push({ id: 't', clientId: 'a', date: '2026-10-02', minutes: 60 });
  assert.notStrictEqual(C.invoice(st, 'a', '2026-10-10').number, n1);
});
test('invoice: a fully part-paid session becomes paid and leaves the invoice', () => {
  const st = base();
  st.sessions.push({ id: 's', clientId: 'a', date: '2026-10-01', minutes: 60 });
  C.applyPayment(st, 'a', C.planPayment(st, 'a', 25), '2026-10-02');
  assert.strictEqual(C.invoice(st, 'a').items.length, 0);
});
test('reminderMessage: the line items add exactly to the stated balance', () => {
  const st = base();
  for (let i = 0; i < 3; i++) st.sessions.push({ id: 's' + i, clientId: 'a', date: '2026-10-0' + (i + 1), minutes: 60 });
  C.applyPayment(st, 'a', C.planPayment(st, 'a', 30), '2026-10-10');
  const msg = C.reminderMessage(st, 'a');
  assert.ok(msg.includes('balance of $45.00 for 2 sessions'), msg);
});
test('stats: earned equals collected plus unpaid after mixed payments', () => {
  const st = base();
  st.sessions.push({ id: 'x', clientId: 'a', date: '2026-10-01', minutes: 60, paid: true },
                   { id: 'y', clientId: 'a', date: '2026-10-02', minutes: 90 });
  C.applyPayment(st, 'a', C.planPayment(st, 'a', 10), '2026-10-05');
  const s = C.stats(st, '2026-10');
  assert.strictEqual(s.earned, 62.5);
  assert.strictEqual(C.cents(s.collected + s.unpaid), s.earned);
});

/* ---------- stale payment plans ---------- */
test('applyPayment: a step landing on a now-paid session is skipped, the payment still logged', () => {
  const st = base();
  st.sessions.push({ id: 's1', clientId: 'a', date: '2026-10-01', minutes: 60 },
                   { id: 's2', clientId: 'a', date: '2026-10-02', minutes: 60 });
  const plan = C.planPayment(st, 'a', 30);
  st.sessions[0].paid = true; // the session was marked paid after the plan was built
  C.applyPayment(st, 'a', plan, '2026-10-10');
  assert.strictEqual(st.sessions[0].partPaid, undefined, 'no part payment on a paid session');
  assert.strictEqual(st.payments.length, 1, 'the received money is still logged');
});
test('applyPayment: a step landing on a volunteer session is skipped entirely', () => {
  const st = base();
  st.sessions.push({ id: 's1', clientId: 'a', date: '2026-10-01', minutes: 60 });
  const plan = C.planPayment(st, 'a', 10);
  st.sessions[0].volunteer = true;
  C.applyPayment(st, 'a', plan, '2026-10-10');
  assert.strictEqual(st.sessions[0].partPaid, undefined);
});
test('applyPayment: an overshoot settles the session and carries the extra, never overshoots', () => {
  const st = base();
  st.sessions.push({ id: 's1', clientId: 'a', date: '2026-10-01', minutes: 60 },
                    { id: 's2', clientId: 'a', date: '2026-10-02', minutes: 60 });
  const plan = { ok: true, amount: 40, steps: [{ id: 's1', applied: 40, settles: false }] };
  C.applyPayment(st, 'a', plan, '2026-10-10');
  assert.strictEqual(st.sessions[0].paid, true);
  assert.strictEqual(st.sessions[0].partPaid, undefined);
  assert.strictEqual(st.sessions[1].partPaid, 15, 'the extra $15 carries to the next session');
});
test('a plan built on a different student cannot be applied to this one', () => {
  const st = base();
  st.clients.push({ id: 'b', name: 'Bob', rate: 30 });
  st.sessions.push({ id: 's', clientId: 'a', date: '2026-10-01', minutes: 60 });
  C.applyPayment(st, 'b', { ok: true, amount: 10, steps: [{ id: 's', applied: 10, settles: false }] }, '2026-10-10');
  assert.strictEqual(st.sessions[0].partPaid, 10, 'step ids drive application, not the client arg');
});

/* ---------- validation boundaries ---------- */
test('validateSession: exactly 600 minutes passes, 600.01 fails', () => {
  const ok = { clientId: 'c', date: '2026-10-01' };
  assert.deepStrictEqual(C.validateSession({ ...ok, minutes: 600 }, '2026-10-10'), []);
  assert.strictEqual(C.validateSession({ ...ok, minutes: 600.01 }, '2026-10-10').length, 1);
});
test('validateSession: 1 minute passes, 0 and negative fail', () => {
  const ok = { clientId: 'c', date: '2026-10-01' };
  assert.deepStrictEqual(C.validateSession({ ...ok, minutes: 1 }, '2026-10-10'), []);
  assert.strictEqual(C.validateSession({ ...ok, minutes: 0 }, '2026-10-10').length, 1);
  assert.strictEqual(C.validateSession({ ...ok, minutes: -30 }, '2026-10-10').length, 1);
});
test('validateSession: a $0 rate override is allowed (a free session)', () => {
  assert.deepStrictEqual(C.validateSession({ clientId: 'c', date: '2026-10-01', minutes: 60, rate: 0 }, '2026-10-10'), []);
});
test('validateClient: $0 rate and a blank email pass; junk email fails', () => {
  assert.deepStrictEqual(C.validateClient({ name: 'A', rate: 0 }), []);
  assert.ok(C.validateClient({ name: 'A', rate: 20, parentEmail: 'a@b' }).length === 1);
});
test('validateClient: an 80-char name passes, 81 fails', () => {
  assert.deepStrictEqual(C.validateClient({ name: 'x'.repeat(80), rate: 10 }), []);
  assert.ok(C.validateClient({ name: 'x'.repeat(81), rate: 10 }).length >= 1);
});
test('validateClient: rate at exactly $1,000 passes, $1,000.01 fails', () => {
  assert.deepStrictEqual(C.validateClient({ name: 'A', rate: 1000 }), []);
  assert.ok(C.validateClient({ name: 'A', rate: 1000.01 }).length === 1);
});

/* ---------- misc core edges ---------- */
test('clientById tolerates missing and duplicate-free lookup', () => {
  const st = base();
  assert.strictEqual(C.clientById(st, 'a').name, 'Ada Lovelace');
  assert.strictEqual(C.clientById(st, 'zzz'), null);
});
test('serviceProgress: no goal means zero pct and no remaining', () => {
  const st = base();
  st.sessions.push({ id: 'v', clientId: 'a', date: '2026-10-01', minutes: 60, volunteer: true });
  const p = C.serviceProgress(st);
  assert.deepStrictEqual([p.hours, p.goal, p.pct, p.remaining], [1, 0, 0, 0]);
});
test('progressReport: a student deleted mid-edit returns an empty string', () => {
  assert.strictEqual(C.progressReport(base(), 'ghost'), '');
});
test('reminderMessage: volunteer-only students get no reminder', () => {
  const st = base();
  st.sessions.push({ id: 'v', clientId: 'a', date: '2026-10-01', minutes: 60, volunteer: true });
  assert.strictEqual(C.reminderMessage(st, 'a'), '');
});
test('summaryMonths: months list newest first, current month always present', () => {
  const st = base();
  st.sessions.push({ id: 's', clientId: 'a', date: 'bad-date', minutes: 60 });
  const m = C.summaryMonths(st, '2026-10');
  assert.ok(m.includes('2026-10') && m.length === 2 && m[0].localeCompare(m[1]) > 0, JSON.stringify(m));
});
test('duplicateNames: identical normalised names group, distinct punctuation does not merge', () => {
  const st = base();
  st.clients.push({ id: 'b', name: 'ada  lovelace', rate: 10 }, { id: 'c', name: 'Ada Lovelaces', rate: 10 });
  const d = C.duplicateNames(st);
  assert.strictEqual(d.length, 1);
  assert.strictEqual(d[0].clients.length, 2);
});
test('demo data: every demo session validates against its own date rules', () => {
  const st = C.demoState('2026-10-10');
  for (const s of st.sessions) assert.deepStrictEqual(C.validateSession(s, '2026-10-10'), []);
  assert.strictEqual(st.sessions.length, 12);
});
test('emptyState: nothing is owed and every list is empty', () => {
  const st = C.emptyState();
  assert.strictEqual(C.stats(st).earned, 0);
  assert.strictEqual(C.balances(st).length, 0);
  assert.deepStrictEqual(st.payments, []);
});
test('setPaid on a missing or volunteer session is a no-op', () => {
  const st = base();
  st.sessions.push({ id: 'v', clientId: 'a', date: '2026-10-01', minutes: 60, volunteer: true });
  assert.deepStrictEqual(C.setPaid(st, 'ghost', true), { settled: 0, moved: 0, leftover: 0 });
  assert.deepStrictEqual(C.setPaid(st, 'v', true), { settled: 0, moved: 0, leftover: 0 });
});
test('deleteSession on a missing id changes nothing', () => {
  const st = base();
  const snap = JSON.stringify(st);
  C.deleteSession(st, 'ghost');
  assert.strictEqual(JSON.stringify(st), snap);
});
test('deleteClient removes archived students too', () => {
  const st = base();
  st.clients[0].archived = true;
  C.deleteClient(st, 'a');
  assert.strictEqual(st.clients.length, 0);
});
test('carryCredit with no money owed reports everything as leftover, never invents credit', () => {
  const st = base();
  const r = C.carryCredit(st, 'a', 50);
  assert.deepStrictEqual(r, { moved: 0, leftover: 50, settled: 0 });
});
test('planPayment: sub-cent amounts round to the cent boundary consistently', () => {
  const st = base();
  st.sessions.push({ id: 's', clientId: 'a', date: '2026-10-01', minutes: 60 });
  assert.strictEqual(C.planPayment(st, 'a', 0.004).ok, false, 'below half a cent rounds to $0: refused');
  const p = C.planPayment(st, 'a', 0.009);
  assert.ok(p.ok && p.amount === 0.01, '0.009 rounds up to a real cent payment, not a phantom');
});
test('planPayment: MAX_PAYMENT boundary', () => {
  const st = base();
  st.sessions.push({ id: 's', clientId: 'a', date: '2026-10-01', minutes: 600, rate: 1000 });
  assert.ok(C.planPayment(st, 'a', 10000).ok, 'a $10,000 session can be paid in full');
  assert.strictEqual(C.planPayment(st, 'a', 100000.01).ok, false);
});
test('addSession: a record without an id gets a generated one; an explicit id is kept', () => {
  const st = base();
  C.addSession(st, { clientId: 'a', date: '2026-10-01', minutes: 60 });
  assert.ok(/^s_/.test(st.sessions[0].id));
  C.addSession(st, { id: 'mine', clientId: 'a', date: '2026-10-02', minutes: 60 });
  assert.strictEqual(st.sessions[1].id, 'mine');
});
test('creditNote composes moved and leftover sentences correctly', () => {
  assert.strictEqual(C.creditNote({ moved: 5, leftover: 0 }), '$5.00 already paid now counts toward other unpaid sessions.');
  assert.strictEqual(C.creditNote({ moved: 0, leftover: 3 }), '$3.00 already paid is more than anything owed: refund it or note it.');
  assert.strictEqual(C.creditNote({ moved: 1, leftover: 2 }), '$1.00 already paid now counts toward other unpaid sessions. $2.00 already paid is more than anything owed: refund it or note it.');
  assert.strictEqual(C.creditNote({ moved: 0, leftover: 0 }), '');
  assert.strictEqual(C.creditNote(null), '');
});
test('fmtMonth handles single months and the short style', () => {
  assert.strictEqual(C.fmtMonth('2026-10'), 'October 2026');
  assert.strictEqual(C.fmtMonth('2026-10', 'short'), 'Oct');
});
test('guessPayMethod edge cases', () => {
  assert.strictEqual(C.guessPayMethod(''), '');
  assert.strictEqual(C.guessPayMethod('   '), '');
  assert.strictEqual(C.guessPayMethod('random words'), '');
});
test('summaryText: a month with only volunteer sessions has no charge line', () => {
  const st = base();
  st.sessions.push({ id: 'v', clientId: 'a', date: '2026-10-01', minutes: 60, volunteer: true });
  const t = C.summaryText(st, '2026-10');
  assert.ok(!t.includes('Charges for'));
  assert.ok(t.includes('Volunteer tutoring (service hours): 1 hour'));
});
test('monthSummary: a month with no sessions returns zeroed totals', () => {
  const m = C.monthSummary(base(), '2030-05');
  assert.strictEqual(m.totals.sessions, 0);
  assert.strictEqual(m.totals.billed, 0);
});

/* ---------- DOM: XSS escaping, CSP, WCAG 2.1.4, commit rollback ---------- */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..') + '/';

test('index.html CSP forbids inline scripts and object embeds', () => {
  const html = fs.readFileSync(dir + 'index.html', 'utf8');
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.ok(csp.includes("script-src 'self'"), csp);
  assert.ok(!csp.includes('unsafe-inline'), csp);
  assert.ok(csp.includes("object-src 'none'"), csp);
});
test('index.html sends no referrer and asks robots not to index', () => {
  const html = fs.readFileSync(dir + 'index.html', 'utf8');
  assert.ok(html.includes('content="no-referrer"'));
  assert.ok(html.includes('noindex'));
});
test('no single-character keyboard shortcuts exist (WCAG 2.1.4)', () => {
  const src = fs.readFileSync(dir + 'js/app.js', 'utf8');
  const handlers = src.match(/addEventListener\('key(?:down|press|up)'[^)]*\)/g) || [];
  for (const h of handlers) assert.ok(!/e\.key\s*===?\s*'[a-z0-9 ;,\./\[\]\\-]'/.test(h) || /ctrlKey|metaKey|shiftKey|altKey|Escape/.test(h), h);
  // The only shortcuts in the file are Ctrl/Cmd+Z and Escape: both exempt (modifier / non-printable).
  assert.ok(src.includes('ctrlKey || e.metaKey'));
});
test('accesskey is never used anywhere in the app', () => {
  for (const f of ['index.html', 'js/app.js', 'js/core.js']) {
    assert.ok(!fs.readFileSync(dir + f, 'utf8').includes('accesskey'), f);
  }
});
test('every innerHTML write escapes user data or is static markup', () => {
  const src = fs.readFileSync(dir + 'js/app.js', 'utf8');
  // template-driven views run through views[route] and esc(); direct innerHTML writes are listed here.
  const writes = src.match(/innerHTML\s*=[^;]+;/g) || [];
  for (const w of writes) {
    const suspicious = w.includes('innerHTML = state') || /innerHTML = [a-zA-Z_]+;/.test(w) && !w.includes('esc(') && !w.includes("''") && !w.includes('views');
    assert.ok(!suspicious, w);
  }
});
test('app.js escapes interpolated user text: esc() wraps every named-field render', () => {
  const src = fs.readFileSync(dir + 'js/app.js', 'utf8');
  // output-only user fields: every ${...} containing one must call esc() inside it
  for (const m of src.matchAll(/\$\{[^}]{0,80}\.(?:topics|notes|parentName|parentEmail|business)[^}]*\}/g)) {
    if (/\$\{[^}]*\.\w+\s*\?/.test(m[0])) continue;   // the field is a ternary condition, not the output
    assert.ok(m[0].includes('esc('), 'unescaped: ' + m[0].slice(0, 90));
  }
  assert.ok((src.match(/esc\(/g) || []).length > 50, 'esc() is the app-wide render convention');
});
test('jsdom: hostile input in every free-text field stays escaped in the DOM', () => {
  const { JSDOM } = require('jsdom');
  const html = fs.readFileSync(dir + 'index.html', 'utf8').replace(/<script src="[^"]+"[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.github.io/Tutorloop/' });
  const w = dom.window;
  w.HTMLCanvasElement.prototype.getContext = () => null;
  w.confirm = () => true; w.scrollTo = () => {}; w.print = () => {};
  w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
  w.eval(fs.readFileSync(dir + 'js/core.js', 'utf8'));
  w.eval(fs.readFileSync(dir + 'js/app.js', 'utf8'));
  const d = w.document;
  const payload = '"><svg onload=alert(1)><a href="javascript:alert(2)">';
  const q = d.getElementById('quickForm');
  q.querySelector('[name=name]').value = payload;
  q.querySelector('[name=topics]').value = payload;
  q.querySelector('[name=notes]').value = payload;
  q.dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
  const app = d.getElementById('app');
  assert.ok(!app.querySelector('svg[onload]'), 'injected svg executed');
  assert.ok(!app.querySelector('a[href^="javascript:"]'), 'javascript: href survived');
});
test('jsdom: a commit that throws rolls the whole change back (storage untouched)', () => {
  const { JSDOM } = require('jsdom');
  const html = fs.readFileSync(dir + 'index.html', 'utf8').replace(/<script src="[^"]+"[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.github.io/Tutorloop/' });
  const w = dom.window;
  w.HTMLCanvasElement.prototype.getContext = () => null;
  w.confirm = () => true; w.scrollTo = () => {}; w.print = () => {};
  w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
  w.eval(fs.readFileSync(dir + 'js/core.js', 'utf8'));
  w.eval(fs.readFileSync(dir + 'js/app.js', 'utf8'));
  const d = w.document;
  // Load sample data, then break addSession's dependency so the session-form commit throws mid-write.
  w.location.hash = '#settings';
  w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  d.querySelector('[data-act=demo]').click();
  const before = w.localStorage.getItem('tutorloop.v1');
  const C = w.TutorCore, orig = C.addSession;
  C.addSession = () => { throw new Error('boom'); };
  w.location.hash = '#log';
  w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  const f = d.getElementById('sessionForm');
  f.querySelector('[name=minutes]').value = '60';
  const errs = [];
  w.addEventListener('error', e => errs.push(e.message));  // listener exceptions report here, not to the caller
  f.dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
  C.addSession = orig;
  assert.ok(errs.length > 0, 'the throw surfaced');
  // rollback restores the same logical state (the stored JSON is the normalized form)
  assert.deepStrictEqual(w.TutorCore.importState(w.localStorage.getItem('tutorloop.v1')),
                         w.TutorCore.importState(before), 'state unchanged after a failed commit');
});

/* ---------- Pass 2: adversarial delegate findings (A1-A6, B1-B7, C1, G1-G2) ---------- */

test('A1: deleting a paid session carries its heldPaid to the family\'s other sessions', () => {
  const st = base();
  st.sessions.push({ id: 's1', clientId: 'a', date: '2026-10-01', minutes: 60, paid: false });
  st.sessions.push({ id: 's2', clientId: 'a', date: '2026-10-02', minutes: 60, paid: false });
  C.applyPayment(st, 'a', C.planPayment(st, 'a', 10), '2026-10-03');
  C.setPaid(st, 's1', true);                                   // heldPaid 10 on paid s1
  assert.strictEqual(C.balances(st)[0].owed, 25);
  const r = C.deleteSession(st, 's1');
  assert.strictEqual(r.moved, 10, 'held money must move, not vanish');
  assert.strictEqual(C.balances(st)[0].owed, 15, 's2 now owes 25 - 10');
});
test('A1: deleting an unpaid part-paid session still carries partPaid (control)', () => {
  const st = base();
  st.sessions.push({ id: 's1', clientId: 'a', date: '2026-10-01', minutes: 60, paid: false });
  st.sessions.push({ id: 's2', clientId: 'a', date: '2026-10-02', minutes: 60, paid: false });
  C.applyPayment(st, 'a', C.planPayment(st, 'a', 10), '2026-10-03');
  const r = C.deleteSession(st, 's1');
  assert.strictEqual(r.moved, 10);
});
test('A2: a stale plan\'s skipped money is carried, not logged and lost', () => {
  const st = base();
  st.sessions.push({ id: 's1', clientId: 'a', date: '2026-10-01', minutes: 60, paid: false });
  st.sessions.push({ id: 's2', clientId: 'a', date: '2026-10-02', minutes: 60, paid: false });
  const plan = C.planPayment(st, 'a', 30);                     // settles s1 (25) + 5 on s2
  C.setPaid(st, 's1', true);                                   // stale the plan
  C.applyPayment(st, 'a', plan, '2026-10-03');
  assert.strictEqual(st.sessions.find(x => x.id === 's2').paid, true, 'the unapplied 25 settled s2 via carryCredit');
  assert.strictEqual(C.balances(st)[0].owed, 0, 'nothing still owed and nothing vanished');
  assert.strictEqual(st.payments[0].amount, 30, 'the full payment is still logged as received');
});
test('A3: import clamps partPaid/heldPaid claims to what the payments log records', () => {
  const st = C.importState({ version: 1, profile: {},
    clients: [{ id: 'c', name: 'A', rate: 30 }],
    sessions: [{ id: 's', clientId: 'c', date: '2026-10-01', minutes: 60, partPaid: 10 }],
    payments: [] });
  assert.strictEqual(st.sessions[0].partPaid, undefined, 'a claim with no ledger entry is dropped');
  assert.strictEqual(C.balances(st)[0].owed, 30);
  const r = C.reminderMessage(st, 'c');
  assert.ok(!/already paid/.test(r), 'no phantom "already paid" in the reminder');
});
test('A3: claims are kept oldest-first up to the logged total', () => {
  const st = C.importState({ version: 1, profile: {},
    clients: [{ id: 'c', name: 'A', rate: 30 }],
    sessions: [
      { id: 's1', clientId: 'c', date: '2026-10-01', minutes: 60, partPaid: 10 },
      { id: 's2', clientId: 'c', date: '2026-10-02', minutes: 60, partPaid: 10 }],
    payments: [{ id: 'p1', clientId: 'c', date: '2026-10-03', amount: 10 }] });
  assert.strictEqual(st.sessions[0].partPaid, 10);
  assert.strictEqual(st.sessions[1].partPaid, undefined);
});
test('A4: settleCovered is bounded by input size, not a fixed 10k guard', () => {
  const n = 10050;
  const sessions = Array.from({ length: n }, (_, i) => ({ id: 's' + i, clientId: 'c', date: '2026-01-01',
    minutes: 60, rate: 30, paid: false, partPaid: 30 }));
  const st = C.importState({ version: 1, profile: {}, clients: [{ id: 'c', name: 'A', rate: 30 }], sessions,
    payments: [{ id: 'p', clientId: 'c', date: '2026-01-02', amount: 30 * n }] });
  assert.strictEqual(st.sessions.filter(s => !s.paid).length, 0, 'no covered-but-unpaid zombies remain');
});
test('A5: editing a held session cheaper carries the excess held money', () => {
  const st = base();
  st.sessions.push({ id: 's1', clientId: 'a', date: '2026-10-01', minutes: 60, paid: false });
  st.sessions.push({ id: 's2', clientId: 'a', date: '2026-10-02', minutes: 60, paid: false });
  C.applyPayment(st, 'a', C.planPayment(st, 'a', 10), '2026-10-03');
  C.setPaid(st, 's1', true);                                   // heldPaid 10
  C.editSession(st, 's1', { clientId: 'a', date: '2026-10-01', minutes: 60, rate: 5, topics: '', notes: '', paid: true, volunteer: false });
  const s1 = st.sessions.find(x => x.id === 's1');
  assert.strictEqual(s1.heldPaid, 5, 'held amount caps at the new session price');
  assert.strictEqual(C.balances(st)[0].owed, 20, 'the other $5 landed on s2');
});
test('A6: a $0 unpaid session stays out of invoice and reminder lines when priced sessions exist', () => {
  const st = base();
  st.sessions.push({ id: 's0', clientId: 'a', date: '2026-10-01', minutes: 60, rate: 0, paid: false });
  st.sessions.push({ id: 's1', clientId: 'a', date: '2026-10-02', minutes: 60, paid: false });
  const inv = C.invoice(st, 'a');
  assert.deepStrictEqual([...inv.items.map(i => i.id)], ['s1'], 'the $0 line is dropped from the invoice');
  assert.strictEqual(inv.total, 25);
  const rem = C.reminderMessage(st, 'a');
  assert.ok(rem.includes('balance of $25.00 for 1 session'));
  assert.ok(!rem.includes('$0.00'), 'no $0.00 line in the reminder');
  // but a client whose only unpaid sessions are $0 still gets a reminder (ledger invariant)
  const st2 = base();
  st2.clients[0].rate = 0;
  st2.sessions.push({ id: 'z', clientId: 'a', date: '2026-10-01', minutes: 60, paid: false });
  assert.ok(C.reminderMessage(st2, 'a').includes('balance of $0.00'));
});
test('B1: import applies the same date bounds as the Log form', () => {
  for (const bad of ['1800-01-01', '9999-12-31', '0000-01-01', '1900-06-15']) {
    const st = C.importState({ version: 1, profile: {}, clients: [{ id: 'c', name: 'A' }],
      sessions: [{ id: 's', clientId: 'c', date: bad, minutes: 60 }],
      payments: [{ id: 'p', clientId: 'c', date: bad, amount: 5 }] });
    assert.strictEqual(st.sessions.length, 0, bad + ' session rejected');
    assert.strictEqual(st.payments.length, 0, bad + ' payment rejected');
  }
});
test('B2: fractional minutes are refused on import and by the form validator', () => {
  const st = C.importState({ version: 1, profile: {}, clients: [{ id: 'c', name: 'A' }],
    sessions: [{ id: 's', clientId: 'c', date: '2026-10-01', minutes: 45.7 }] });
  assert.strictEqual(st.sessions.length, 0);
  assert.ok(C.validateSession({ clientId: 'c', date: '2026-10-01', minutes: 45.7 }, '2026-10-02').length > 0);
});
test('B3: a whitespace-only client name is refused on import', () => {
  const st = C.importState({ version: 1, profile: {}, clients: [{ id: 'c', name: '   ' }], sessions: [] });
  assert.strictEqual(st.clients.length, 0);
});
test('B4: ids that would break hash routing are refused on import', () => {
  const st = C.importState({ version: 1, profile: {},
    clients: [{ id: 'a/b', name: 'X' }, { id: 'ok', name: 'Y' }],
    sessions: [{ id: 's1', clientId: 'a/b', date: '2026-10-01', minutes: 60 },
               { id: 's%20x', clientId: 'ok', date: '2026-10-01', minutes: 60 }] });
  assert.deepStrictEqual(st.clients.map(c => c.id), ['ok']);
  assert.strictEqual(st.sessions.length, 0, 'both the bad clientId and bad session id are refused');
});
test('B5: a malformed parentEmail is blanked on import, not kept', () => {
  const st = C.importState({ version: 1, profile: {},
    clients: [{ id: 'c', name: 'A', parentEmail: 'not-an-email' }], sessions: [] });
  assert.strictEqual(st.clients[0].parentEmail, '');
});
test('B6: paid+volunteer sessions cannot import as both', () => {
  const st = C.importState({ version: 1, profile: {}, clients: [{ id: 'c', name: 'A' }],
    sessions: [{ id: 's', clientId: 'c', date: '2026-10-01', minutes: 60, paid: true, volunteer: true, heldPaid: 5 }] });
  assert.strictEqual(st.sessions[0].paid, false);
  assert.strictEqual(st.sessions[0].volunteer, true);
});
test('B7: a month with only a payment still appears in the month picker', () => {
  const st = base();
  st.sessions.push({ id: 's1', clientId: 'a', date: '2026-10-01', minutes: 60, paid: false });
  st.payments = [{ id: 'p1', clientId: 'a', date: '2026-08-15', amount: 5 }];
  const months = C.summaryMonths(st, '2026-11');
  assert.ok(months.includes('2026-08'), 'payment-only month listed');
});
test('C1: formula triggers after leading whitespace are still prefixed', () => {
  for (const cell of ['=1+1', ' =1+1', '  =1+1', '\t=HYPERLINK("x")', '\n=1+1', '\u00a0=1+1']) {
    const out = C.csvEscape(cell).replace(/^"|"$/g, '');
    assert.ok(out.startsWith("'"), JSON.stringify(cell) + ' must be apostrophe-prefixed');
  }
  assert.strictEqual(C.csvEscape('plain'), 'plain');
});
test('G1: proValue returns null instead of Infinity minutes on a sub-cent rate', () => {
  const st = C.emptyState();
  st.clients.push({ id: 'c', name: 'A', rate: 0.001 });
  st.sessions.push({ id: 's', clientId: 'c', date: '2026-10-01', minutes: 600, paid: false });
  assert.strictEqual(C.proValue(st, 4), null);
});
test('G2: Start fresh removes sample data but keeps students the user added', () => {
  const { JSDOM } = require('jsdom');
  const html = fs.readFileSync(dir + 'index.html', 'utf8').replace(/<script src="[^"]+"[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.github.io/Tutorloop/' });
  const w = dom.window;
  w.HTMLCanvasElement.prototype.getContext = () => null;
  w.confirm = () => true; w.scrollTo = () => {}; w.print = () => {};
  w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
  w.eval(fs.readFileSync(dir + 'js/core.js', 'utf8'));
  w.eval(fs.readFileSync(dir + 'js/app.js', 'utf8'));
  const d = w.document;
  w.location.hash = '#settings';
  w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  d.querySelector('[data-act=demo]').click();
  // free a roster slot (the Free plan caps at 3) by archiving a sample student, then add a real one
  w.location.hash = '#students/c_maya';
  w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  d.querySelector('[data-act=archiveClient]').click();
  w.location.hash = '#students';
  w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  const form = d.getElementById('clientForm');
  form.querySelector('[name=name]').value = 'Real Student';
  form.querySelector('[name=rate]').value = '40';
  form.dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
  assert.ok(d.querySelector('[data-act=startFresh]'), 'sample bar is up');
  d.querySelector('[data-act=startFresh]').click();
  const stored = w.TutorCore.importState(w.localStorage.getItem('tutorloop.v1'));
  assert.deepStrictEqual([...stored.clients.map(c => c.name)], ['Real Student'], 'real data kept');
  assert.strictEqual(stored.sample, undefined);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
