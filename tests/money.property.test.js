// Property-style tests for TutorLoop's money math (js/core.js). Run: node tests/money.property.test.js
// No dependencies. A seeded PRNG builds thousands of random tutoring histories and random operation
// sequences (log, edit, part payments, mark paid/unpaid, archive/restore, backup, CSV), then checks
// invariants that must hold for every one of them. Set SEED=123 to replay a run; ROUNDS to go deeper.
// A failure prints the seed and the step so it can be replayed exactly.
const assert = require('assert');
const C = require('../js/core.js');

const ROUNDS = Number(process.env.ROUNDS) || 400;
const BASE_SEED = Number(process.env.SEED) || 20261011;

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const toC = x => Math.round(x * 100) + 0;               // dollars -> integer cents
const sumC = xs => xs.reduce((a, x) => a + toC(x), 0);

/* Exact reference: what a session should cost, computed in integer arithmetic (no floats).
 * rate is given in cents, minutes an integer: amount = round_half_up(rateCents * minutes / 60). */
function refAmountC(rateC, minutes) { const num = rateC * minutes; return Math.floor((2 * num + 60) / 120); }

function randRateC(r) {
  const k = r();
  if (k < 0.15) return 0;
  if (k < 0.55) return 100 * (5 + Math.floor(r() * 96));       // whole dollars $5-$100
  if (k < 0.75) return 50 * (10 + Math.floor(r() * 190));      // half dollars
  return 1 + Math.floor(r() * 100000);                          // any cent amount up to $1,000.00
}
const MINUTES = [15, 20, 25, 30, 40, 45, 50, 55, 60, 75, 80, 90, 105, 120, 150, 180, 7, 13, 599, 600];

function randomState(r) {
  const st = C.emptyState();
  const nc = 1 + Math.floor(r() * 4);
  for (let i = 0; i < nc; i++) st.clients.push({ id: 'c' + i, name: 'Student ' + i, subject: '', grade: '', rate: randRateC(r) / 100, parentName: '', parentEmail: '', archived: false, volunteerDefault: false });
  const ns = Math.floor(r() * 25);
  for (let i = 0; i < ns; i++) {
    const c = st.clients[Math.floor(r() * nc)];
    const day = C.addDays('2025-12-20', Math.floor(r() * 300));   // spans a year end, a leap-free Feb, DST dates
    const over = r() < 0.2 ? randRateC(r) / 100 : null;
    st.sessions.push({ id: 's' + i, clientId: c.id, date: day, minutes: MINUTES[Math.floor(r() * MINUTES.length)], rate: over, topics: 't' + i, notes: '', paid: r() < 0.3, volunteer: r() < 0.1 });
  }
  st.sessions.forEach(s => { if (s.volunteer) s.paid = false; });
  return st;
}

const owedC = (st, id) => toC(C.balances(st).find(b => b.client.id === id).owed);
const unpaidOf = (st, id) => st.sessions.filter(s => s.clientId === id && !s.paid && !s.volunteer);

/** Invariants that must hold for ANY state the app can reach. */
function checkInvariants(st, where) {
  const ctx = m => where + ': ' + m;
  for (const s of st.sessions) {
    const c = C.clientById(st, s.clientId);
    const amt = C.sessionAmount(s, c), due = C.sessionDue(s, c);
    // every money value is a whole number of cents
    for (const v of [amt, due]) assert.ok(Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, ctx('not whole cents: ' + v));
    // the float engine agrees with exact integer arithmetic
    const rateC = toC(s.rate != null && s.rate !== '' ? Number(s.rate) : Number(c.rate));
    if (!s.volunteer) assert.strictEqual(toC(amt), refAmountC(rateC, s.minutes), ctx('amount ' + rateC + 'c x ' + s.minutes + ' min'));
    assert.ok(due >= 0 && due <= amt + 1e-9, ctx('due outside 0..amount'));
    // a session whose part payments cover it in full is paid, never "unpaid with $0 left"
    if (!s.paid && !s.volunteer && amt > 0) assert.ok(due > 0, ctx('session ' + s.id + ' is unpaid but owes $0 (part paid ' + s.partPaid + ' of ' + amt + ')'));
    if (s.paid || s.volunteer) assert.ok(!(Number(s.partPaid) > 0), ctx('paid/volunteer session keeps a part payment'));
  }
  const bal = C.balances(st);
  for (const b of bal) {
    const id = b.client.id, ss = unpaidOf(st, id);
    const inv = C.invoice(st, id, '2026-10-11');
    // one balance everywhere: dashboard, invoice, reminder, monthly statement
    assert.strictEqual(toC(inv.total), toC(b.owed), ctx('invoice vs balance'));
    assert.strictEqual(sumC(inv.items.map(i => i.amount)), toC(inv.total), ctx('invoice lines add up'));
    assert.strictEqual(toC(C.monthSummary(st, '2026-03', id).balanceAll), toC(b.owed), ctx('statement balance'));
    const rem = C.reminderMessage(st, id);
    if (ss.length) assert.ok(rem.includes('balance of ' + C.money(b.owed) + ' for '), ctx('reminder total ' + C.money(b.owed)));
    // what's paid toward unpaid sessions + what's owed = what they cost
    assert.strictEqual(toC(b.partPaid) + toC(b.owed), toC(b.unpaidBilled), ctx('part paid + owed = billed'));
    assert.strictEqual(b.unpaidSessions, ss.length, ctx('unpaid count'));
  }
  // month by month adds up to the all-time numbers, and billed = paid + unpaid exactly
  const months = C.summaryMonths(st);
  let earnedC = 0, unpaidC = 0;
  for (const m of months) {
    const k = C.stats(st, m); earnedC += toC(k.earned); unpaidC += toC(k.unpaid);
    assert.strictEqual(toC(k.earned), toC(k.collected) + toC(k.unpaid), ctx('earned = collected + unpaid in ' + m));
    const ms = C.monthSummary(st, m);
    assert.strictEqual(toC(ms.totals.billed), toC(ms.totals.paid) + toC(ms.totals.unpaid), ctx('summary billed split ' + m));
    assert.strictEqual(sumC(ms.students.map(x => x.billed)), toC(ms.totals.billed), ctx('per-student billed adds up ' + m));
    assert.strictEqual(toC(ms.totals.billed), toC(k.earned), ctx('summary vs dashboard ' + m));
  }
  const all = C.stats(st);
  assert.strictEqual(earnedC, toC(all.earned), ctx('months add up to all time (earned)'));
  assert.strictEqual(unpaidC, toC(all.unpaidAll), ctx('months add up to all time (unpaid)'));
  assert.strictEqual(sumC(bal.map(b => b.owed)), toC(all.unpaidAll), ctx('balances add up to dashboard unpaid'));
}

/** CSV: parse what Export sessions writes and check it says the same as the app. */
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += ch;
  }
  row.push(cell); rows.push(row); return rows;
}
function checkCSV(st, where) {
  const rows = parseCSV(C.sessionsCSV(st));
  const head = rows.shift();
  assert.deepStrictEqual(head, ['Date', 'Student', 'Minutes', 'Rate', 'Amount', 'Paid', 'Volunteer', 'Topics', 'Notes', 'Part paid'], where);
  assert.strictEqual(rows.length, st.sessions.length, where + ': one row per session');
  const sorted = st.sessions.slice().sort((a, b) => a.date.localeCompare(b.date));
  let csvOwedC = 0;
  rows.forEach((r, i) => {
    const s = sorted[i], c = C.clientById(st, s.clientId);
    assert.strictEqual(r[0], s.date, where + ': date column');
    assert.strictEqual(toC(Number(r[4])), toC(C.sessionAmount(s, c)), where + ': amount column');
    // Rate x Minutes reproduces Amount (a spreadsheet user can check the math)
    if (r[6] === 'no') assert.strictEqual(refAmountC(toC(Number(r[3])), Number(r[2])), toC(Number(r[4])), where + ': rate x minutes');
    if (r[5] === 'no' && r[6] === 'no') csvOwedC += toC(Number(r[4])) - toC(Number(r[9]));
    else assert.strictEqual(Number(r[9]), 0, where + ': part paid only on unpaid sessions');
  });
  assert.strictEqual(csvOwedC, toC(C.stats(st).unpaidAll), where + ': CSV Amount - Part paid adds up to what is owed');
}

/** Backup: Export JSON -> Restore gives back the same data and the same numbers. */
function checkBackup(st, where) {
  const back = C.importState(JSON.parse(JSON.stringify(st)));
  const strip = x => JSON.parse(JSON.stringify(x));
  assert.deepStrictEqual(strip(back.sessions), strip(st.sessions), where + ': sessions survive a backup');
  assert.deepStrictEqual(strip(back.payments), strip(st.payments), where + ': payments survive a backup');
  assert.deepStrictEqual(C.stats(back), C.stats(st), where + ': numbers survive a backup');
  assert.deepStrictEqual(C.balances(back).map(b => [b.client.id, b.owed, b.partPaid]), C.balances(st).map(b => [b.client.id, b.owed, b.partPaid]), where + ': balances survive a backup');
  // and a second round trip changes nothing (import is idempotent)
  assert.deepStrictEqual(strip(C.importState(JSON.stringify(back))), strip(back), where + ': import is idempotent');
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (e) { failed++; console.log('✗ ' + name + '\n    ' + e.message.split('\n').slice(0, 6).join('\n    ')); }
}

test('session amounts match exact integer cents math (round half up) for 120,000 rate x minute pairs', () => {
  const r = rng(BASE_SEED); let n = 0;
  for (let i = 0; i < 120000; i++) {
    const rateC = i < 100000 ? i + 1 : randRateC(r), min = 1 + Math.floor(r() * 600);
    assert.strictEqual(toC(C.sessionAmount({ minutes: min }, { rate: rateC / 100 })), refAmountC(rateC, min), rateC + 'c x ' + min + ' min'); n++;
  }
  assert.strictEqual(n, 120000);
});

test('money() prints exactly cents() with separators, and reads back to the same number', () => {
  const r = rng(BASE_SEED + 1);
  for (let i = 0; i < 20000; i++) {
    const v = (r() - 0.2) * Math.pow(10, Math.floor(r() * 8)) + (r() < 0.1 ? 0.005 : 0);
    const s = C.money(v);
    assert.ok(/^-?\$\d{1,3}(,\d{3})*\.\d{2}$/.test(s), s);
    assert.strictEqual(toC(Number(s.replace(/[$,]/g, ''))), toC(C.cents(v)), v + ' -> ' + s);
    assert.strictEqual(toC(C.cents(C.cents(v))), toC(C.cents(v)), 'cents() is idempotent for ' + v);
  }
  assert.strictEqual(C.money(-0.004), '$0.00'); // never "-$0.00"
});

test('random part payments: owed drops by exactly the payment, oldest first, received = collected', () => {
  for (let k = 0; k < ROUNDS; k++) {
    const seed = BASE_SEED + 100 + k, r = rng(seed), st = randomState(r);
    st.sessions.forEach(s => { s.paid = false; });   // only "Record a payment" moves money here
    for (const c of st.clients) {
      let guard = 0;
      while (owedC(st, c.id) > 0 && guard++ < 30) {
        const before = owedC(st, c.id);
        const pay = r() < 0.2 ? before : Math.max(1, Math.floor(r() * before * (r() < 0.5 ? 0.3 : 1)));
        const plan = C.planPayment(st, c.id, (pay / 100).toFixed(2));
        assert.ok(plan.ok, 'seed ' + seed + ': ' + plan.error);
        // oldest first: no session newer than a touched one is settled while an older one still owes
        C.applyPayment(st, c.id, plan, '2026-10-11');
        assert.strictEqual(owedC(st, c.id), before - pay, 'seed ' + seed + ': owed ' + before + ' - ' + pay);
        const open = unpaidOf(st, c.id).filter(s => C.sessionDue(s, c) > 0).map(s => s.date).sort();
        const settled = st.sessions.filter(s => s.clientId === c.id && s.paid).map(s => s.date);
        if (open.length) assert.ok(settled.every(d => d <= open[0]), 'seed ' + seed + ': a newer session was settled before an older one');
        checkInvariants(st, 'seed ' + seed);
      }
      assert.strictEqual(owedC(st, c.id), 0, 'seed ' + seed + ': paid off');
      const receivedC = sumC(st.payments.filter(p => p.clientId === c.id).map(p => p.amount));
      const collectedC = st.sessions.filter(s => s.clientId === c.id && !s.volunteer).reduce((a, s) => a + toC(C.sessionAmount(s, c)), 0);
      assert.strictEqual(receivedC, collectedC, 'seed ' + seed + ': payments received = billed when paid off');
    }
  }
});

test('payments are refused, never partly applied: over the balance, $0, negative, half a cent, junk', () => {
  for (let k = 0; k < ROUNDS; k++) {
    const seed = BASE_SEED + 5000 + k, r = rng(seed), st = randomState(r);
    const c = st.clients[0], snap = JSON.stringify(st), owed = owedC(st, c.id);
    for (const bad of [(owed + 1) / 100, 0, -5, '', null, 'abc', NaN, Infinity, 0.004, 100000.01]) {
      const plan = C.planPayment(st, c.id, bad);
      assert.ok(!plan.ok, 'seed ' + seed + ': accepted ' + bad);
      C.applyPayment(st, c.id, plan, '2026-10-11');
      assert.strictEqual(JSON.stringify(st), snap, 'seed ' + seed + ': a refused payment changed data');
    }
  }
});

test('random operation sequences (log, edit, pay, mark paid/unpaid, archive/restore, delete, backup) keep every invariant', () => {
  for (let k = 0; k < ROUNDS; k++) {
    const seed = BASE_SEED + 9000 + k, r = rng(seed); let st = randomState(r);
    for (let step = 0; step < 40; step++) {
      const where = 'seed ' + seed + ' step ' + step;
      const c = st.clients[Math.floor(r() * st.clients.length)];
      const mine = st.sessions.filter(s => s.clientId === c.id);
      const pick = mine[Math.floor(r() * mine.length)];
      const op = Math.floor(r() * 9);
      if (op === 0) { // record a random payment
        const o = owedC(st, c.id); if (o > 0) { const p = C.planPayment(st, c.id, (Math.max(1, Math.floor(r() * o)) / 100).toFixed(2)); assert.ok(p.ok, where); C.applyPayment(st, c.id, p, '2026-10-11'); }
      } else if (op === 1 && pick) { // edit a session the way the Log form does (js/app.js sessionForm submit)
        const rec = { minutes: MINUTES[Math.floor(r() * MINUTES.length)], rate: r() < 0.3 ? randRateC(r) / 100 : pick.rate, paid: pick.paid, volunteer: r() < 0.05 ? true : pick.volunteer };
        if (rec.volunteer) rec.paid = false;
        C.editSession(st, pick.id, rec);
      } else if (op === 2 && pick && !pick.volunteer) { C.setPaid(st, pick.id, !pick.paid); }   // the Paid toggle
      else if (op === 3) { c.archived = !c.archived; }                                      // archive / restore
      else if (op === 4 && pick) { C.deleteSession(st, pick.id); }                           // delete a session
      else if (op === 5) { st = C.importState(JSON.stringify(st)); }                         // backup + restore
      else if (op === 6) { C.addSession(st, { id: 'n' + step, clientId: c.id, date: C.addDays('2026-01-01', Math.floor(r() * 280)), minutes: MINUTES[Math.floor(r() * MINUTES.length)], rate: null, topics: '', notes: '', paid: false, volunteer: false }); }
      else if (op === 7) { st.clients.forEach(x => { if (x.id === c.id) x.rate = randRateC(r) / 100; }); C.settleCovered(st); } // student rate edit
      else if (op === 8) { const o = owedC(st, c.id); if (o > 0) { const p = C.planPayment(st, c.id, (o / 100).toFixed(2)); C.applyPayment(st, c.id, p, '2026-10-11'); assert.strictEqual(owedC(st, c.id), 0, where); } }
      checkInvariants(st, where);
    }
    checkCSV(st, 'seed ' + seed);
    checkBackup(st, 'seed ' + seed);
  }
});

test('archive and restore never change a single money number', () => {
  for (let k = 0; k < ROUNDS; k++) {
    const seed = BASE_SEED + 20000 + k, r = rng(seed), st = randomState(r);
    const before = JSON.stringify([C.stats(st), C.balances(st).map(b => [b.client.id, b.owed, b.partPaid]), st.clients.map(c => C.invoice(st, c.id, '2026-10-11').total)]);
    st.clients.forEach(c => { c.archived = true; });
    const mid = JSON.stringify([C.stats(st), C.balances(st).map(b => [b.client.id, b.owed, b.partPaid]), st.clients.map(c => C.invoice(st, c.id, '2026-10-11').total)]);
    st.clients.forEach(c => { c.archived = false; });
    const after = JSON.stringify([C.stats(st), C.balances(st).map(b => [b.client.id, b.owed, b.partPaid]), st.clients.map(c => C.invoice(st, c.id, '2026-10-11').total)]);
    assert.strictEqual(mid, before, 'seed ' + seed + ' archived');
    assert.strictEqual(after, before, 'seed ' + seed + ' restored');
  }
});

test('CSV export and JSON backup round-trip random histories with part payments', () => {
  for (let k = 0; k < ROUNDS; k++) {
    const seed = BASE_SEED + 30000 + k, r = rng(seed), st = randomState(r);
    for (const c of st.clients) { const o = owedC(st, c.id); if (o > 1) { const p = C.planPayment(st, c.id, (Math.floor(o / 3) / 100).toFixed(2)); if (p.ok) C.applyPayment(st, c.id, p, C.addDays('2026-01-01', Math.floor(r() * 200))); } }
    // hostile text in names/topics must not break the CSV columns
    st.clients[0].name = '=HYPERLINK("x"), "Jr."\nTwo'; if (st.sessions[0]) st.sessions[0].topics = 'a,b "c"\r\nd';
    checkCSV(st, 'seed ' + seed);
    checkBackup(st, 'seed ' + seed);
  }
});

test('dates are calendar strings, so time zones cannot move a session across a day or month', () => {
  // walk every day of 2024-2027 (leap day, both DST switches in the US and EU)
  let d = '2024-01-01', n = 0;
  while (d <= '2027-12-31') {
    assert.ok(C.isValidDate(d), d);
    const next = C.addDays(d, 1);
    assert.strictEqual(C.addDays(next, -1), d, 'addDays is reversible at ' + d);
    assert.ok(next > d, 'days increase at ' + d);
    assert.strictEqual(C.monthKey(d), d.slice(0, 7));
    const [y, m, day] = d.split('-').map(Number);
    assert.ok(C.fmtDate(d, true).endsWith(String(y)) && C.fmtDate(d, true).includes(' ' + day + ','), 'fmtDate ' + d + ' -> ' + C.fmtDate(d, true));
    d = next; n++;
  }
  assert.strictEqual(n, 1461);
  assert.strictEqual(C.addDays('2026-03-08', 1), '2026-03-09'); // US spring forward
  assert.strictEqual(C.addDays('2026-11-01', 1), '2026-11-02'); // US fall back
  assert.strictEqual(C.rangePreset('month', '2026-10-31').from, '2026-10-01');
  assert.deepStrictEqual(C.monthlySeries(C.emptyState(), '2026-03', 3).map(x => x.month), ['2026-01', '2026-02', '2026-03']);
  assert.ok(C.validateSession({ clientId: 'c', date: '2026-10-12', minutes: 60 }, '2026-10-11').length === 0, 'tomorrow allowed (a tutor east of the server)');
});

test('money already received is never dropped: edit down, rate cut, made volunteer, deleted (worked examples)', () => {
  const mk = () => { const st = C.emptyState(); st.clients.push({ id: 'c', name: 'Ethan', rate: 30 });
    [['a', '2026-09-01'], ['b', '2026-09-08'], ['c2', '2026-09-15']].forEach(([id, date]) => st.sessions.push({ id, clientId: 'c', date, minutes: 60, rate: null, paid: false, volunteer: false }));
    C.applyPayment(st, 'c', C.planPayment(st, 'c', 50), '2026-09-20'); return st; };   // $30 settles Sep 1, $20 part-paid on Sep 8
  const s = (st, id) => st.sessions.find(x => x.id === id);
  // 1. Sep 8 edited from 60 to 30 min ($15): the $20 covers it, $5 moves to Sep 15
  let st = mk(), r = C.editSession(st, 'b', { minutes: 30 });
  assert.strictEqual(s(st, 'b').paid, true); assert.strictEqual(s(st, 'b').partPaid, undefined);
  assert.strictEqual(s(st, 'c2').partPaid, 5); assert.strictEqual(C.balances(st)[0].owed, 25);
  assert.deepStrictEqual(r, { settled: 1, moved: 5, leftover: 0 });
  assert.strictEqual(C.creditNote(r), '$5.00 already paid now counts toward other unpaid sessions.');
  // 2. Student rate cut to $10/hr: Sep 8 ($10) is covered by the $20, $10 settles Sep 15 too
  st = mk(); st.clients[0].rate = 10; r = C.settleCovered(st);
  assert.ok(s(st, 'b').paid && s(st, 'c2').paid); assert.strictEqual(C.balances(st)[0].owed, 0); assert.deepStrictEqual(r, { settled: 2, moved: 10, leftover: 0 });
  // 3. Sep 8 switched to volunteer: its $20 goes to Sep 15 ($10 left)
  st = mk(); r = C.editSession(st, 'b', { volunteer: true, paid: false });
  assert.strictEqual(s(st, 'b').partPaid, undefined); assert.strictEqual(s(st, 'c2').partPaid, 20); assert.strictEqual(C.balances(st)[0].owed, 10);
  // 4. Sep 8 deleted: same
  st = mk(); r = C.deleteSession(st, 'b');
  assert.strictEqual(st.sessions.length, 2); assert.strictEqual(s(st, 'c2').partPaid, 20); assert.deepStrictEqual(r, { moved: 20, leftover: 0, settled: 0 });
  // 5. nothing left to absorb it: say so plainly, never invent a credit
  st = mk(); st.sessions = st.sessions.filter(x => x.id !== 'c2'); r = C.editSession(st, 'b', { minutes: 20 });
  assert.deepStrictEqual(r, { settled: 1, moved: 0, leftover: 10 });
  assert.strictEqual(C.creditNote(r), '$10.00 already paid is more than anything owed: refund it or note it.');
  // 6. a backup saved with a covered-but-unpaid session restores consistent (and stays so)
  st = mk(); s(st, 'b').minutes = 30; const back = C.importState(JSON.stringify(st));
  assert.ok(back.sessions.find(x => x.id === 'b').paid); assert.strictEqual(back.sessions.find(x => x.id === 'c2').partPaid, 5);
  assert.deepStrictEqual(C.importState(JSON.stringify(back)), back);
  // 7. edits that don't touch money change nothing else
  st = mk(); const before = JSON.stringify(st.sessions.filter(x => x.id !== 'b')); r = C.editSession(st, 'b', { topics: 'fractions' });
  assert.strictEqual(JSON.stringify(st.sessions.filter(x => x.id !== 'b')), before); assert.strictEqual(s(st, 'b').partPaid, 20); assert.strictEqual(C.creditNote(r), '');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed  (seed ' + BASE_SEED + ', ' + ROUNDS + ' rounds; ' + (process.env.TZ || 'system TZ') + ')');
process.exit(failed ? 1 : 0);
