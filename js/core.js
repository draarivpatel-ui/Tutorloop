/*
 * TutorLoop core logic: pure functions, no DOM.
 * Works in the browser (window.TutorCore) and in Node (module.exports) so it can be unit-tested.
 */
(function (root) {
  'use strict';

  const SCHEMA_VERSION = 1;
  const FREE_CLIENT_LIMIT = 3;
  const MAX_MINUTES = 600;
  const MIN_DATE = '2000-01-01';

  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  function emptyState() {
    return {
      version: SCHEMA_VERSION,
      profile: { name: '', business: '', email: '', venmo: '', payMethod: '', referralFooter: false, plan: 'free', serviceGoal: '' },
      clients: [],
      sessions: [],
      payments: []
    };
  }

  /* ---------- small helpers ---------- */

  /** Round to cents to avoid floating-point drift. */
  function cents(n) {
    // toPrecision(12) first, so an exact half-cent such as 5.02 x 15/60 = 1.255 (stored as 1.25499999...) rounds up to $1.26, not down to $1.25.
    return Math.round(Number(((Number(n) || 0) * 100).toPrecision(12))) / 100;
  }

  function money(n) {
    const v = cents(n), neg = v < 0;
    const [whole, frac] = Math.abs(v).toFixed(2).split('.');
    return (neg ? '-' : '') + '$' + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + frac;
  }

  /** "1 session", "2 sessions", "1 family", "3 families". */
  function plural(n, word, many) {
    return n + ' ' + (n === 1 ? word : (many || word + 's'));
  }

  /** True for a real calendar date in YYYY-MM-DD form (rejects 2026-02-31). */
  function isValidDate(str) {
    if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
    const [y, m, d] = str.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  /** Add n days to a YYYY-MM-DD string (n can be negative). */
  function addDays(dateStr, n) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  }

  function monthKey(dateStr) {
    return String(dateStr).slice(0, 7); // YYYY-MM
  }

  /** "Oct 8". Adds the year when it differs from refYear, or always when refYear is true. */
  function fmtDate(d, refYear) {
    if (!isValidDate(d)) return '';
    const [y, m, day] = d.split('-').map(Number);
    const withYear = refYear === true || (refYear && Number(refYear) !== y);
    return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: withYear ? 'numeric' : undefined, timeZone: 'UTC' });
  }

  function fmtMonth(key, style) {
    const [y, m] = String(key).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-US', { month: style || 'long', year: style ? undefined : 'numeric', timeZone: 'UTC' });
  }

  /* ---------- money ---------- */

  /** Amount owed for a session. Volunteer sessions are always $0. */
  function sessionAmount(session, client) {
    if (!session || session.volunteer) return 0;
    const rate = session.rate != null && session.rate !== '' ? Number(session.rate) : Number(client && client.rate);
    const hours = (Number(session.minutes) || 0) / 60;
    return cents((Number.isFinite(rate) ? rate : 0) * hours);
  }

  /**
   * What is still owed on a session: its amount minus anything recorded as a part payment.
   * Paid and volunteer sessions owe $0. A session never owes less than $0 if it is edited down.
   */
  function sessionDue(session, client) {
    if (!session || session.volunteer || session.paid) return 0;
    return cents(Math.max(0, sessionAmount(session, client) - (Number(session.partPaid) || 0)));
  }

  /** Sum of what is still owed across a list of sessions of one student. */
  function dueTotal(sessions, client) {
    return cents(sessions.reduce((a, s) => a + Math.round(sessionDue(s, client) * 100), 0) / 100);
  }

  function clientById(state, id) {
    return state.clients.find(c => c.id === id) || null;
  }

  /* ---------- validation ---------- */

  const normName = v => String(v || '').trim().replace(/\s+/g, ' ').toLowerCase();

  /** Students that share a name (case and spacing ignored), e.g. from a backup made before the form
   *  refused duplicates. Returns [{ name, clients: [...] }] in roster order; empty when all names differ. */
  function duplicateNames(state) {
    const groups = new Map();
    (state.clients || []).forEach(c => { const k = normName(c.name); if (!k) return; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); });
    return [...groups.values()].filter(g => g.length > 1).map(g => ({ name: String(g[0].name).trim().replace(/\s+/g, ' '), clients: g }));
  }

  /** The name to show in pickers: just the name, or with subject/grade (else "#2") when another student shares it. */
  function clientLabel(state, c) {
    const twins = (state.clients || []).filter(x => normName(x.name) === normName(c.name));
    if (twins.length < 2) return c.name;
    const extra = [c.subject, c.grade ? 'grade ' + c.grade : ''].filter(Boolean).join(', ');
    const sameExtra = extra && twins.filter(x => [x.subject, x.grade ? 'grade ' + x.grade : ''].filter(Boolean).join(', ') === extra).length > 1;
    return c.name + ' (' + (extra && !sameExtra ? extra : '#' + (twins.indexOf(c) + 1)) + ')';
  }

  /** One plain sentence warning about duplicate names, or '' when there are none. */
  function duplicateNamesWarning(state) {
    const d = duplicateNames(state);
    if (!d.length) return '';
    const list = d.map(g => g.clients.length + ' students named ' + g.name).join('; ');
    return 'This data has ' + list + '. All were kept, but invoices and reminders can mix them up: edit one and add a last initial.';
  }

  function validateClient(c, state) {
    const errors = [];
    if (!c.name || !String(c.name).trim()) errors.push('Student name is required.');
    if (String(c.name || '').length > 80) errors.push('Student name must be 80 characters or fewer.');
    if (c.rate === '' || c.rate == null || isNaN(Number(c.rate)) || Number(c.rate) < 0 || Number(c.rate) > 1000) errors.push('Hourly rate must be between $0 and $1,000.');
    if (c.parentEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.parentEmail)) errors.push('Parent email looks invalid.');
    // Two students with the same name make the invoice picker, reminders and statements ambiguous.
    // An edit that keeps the student's own name is allowed even if a restored backup already holds a
    // twin (imports keep both and warn), so the tutor can still fix the rate or email of either one.
    const norm = normName;
    const own = state && c.id ? clientById(state, c.id) : null;
    const keepsOwnName = own && norm(own.name) === norm(c.name);
    const dup = state && norm(c.name) && !keepsOwnName && state.clients.find(x => x.id !== c.id && norm(x.name) === norm(c.name));
    if (dup) errors.push(dup.archived
      ? 'You already have an archived student named ' + String(dup.name).trim() + '. Restore them from Students instead of adding them again.'
      : 'You already have a student named ' + String(dup.name).trim() + '. Add a last initial so invoices and reminders don\'t mix them up.');
    if (state && !c.id && state.profile.plan === 'free' && state.clients.filter(x => !x.archived).length >= FREE_CLIENT_LIMIT) {
      errors.push('The Free plan includes ' + FREE_CLIENT_LIMIT + ' active students. Archive a student or switch to Pro for unlimited.');
    }
    return errors;
  }

  /** today (YYYY-MM-DD, the tutor's local date) is optional; when given, dates after tomorrow are refused
   *  (a typo like 2062 would otherwise sit in every balance and reminder). One day of slack covers time zones. */
  function validateSession(s, today) {
    const errors = [];
    if (!s.clientId) errors.push('Pick a student.');
    if (!isValidDate(s.date)) errors.push('Enter a valid date.');
    else if (s.date < MIN_DATE) errors.push('Enter a date from the year 2000 on (check the year).');
    else if (isValidDate(today) && s.date > addDays(today, 1)) errors.push('That date is in the future. Check the year: log a session after it happens.');
    const m = Number(s.minutes);
    if (!Number.isFinite(m) || m <= 0 || m > MAX_MINUTES) errors.push('Duration must be between 1 and ' + MAX_MINUTES + ' minutes.');
    if (s.rate != null && s.rate !== '' && (isNaN(Number(s.rate)) || Number(s.rate) < 0 || Number(s.rate) > 1000)) errors.push('Rate override must be between $0 and $1,000.');
    return errors;
  }

  /* ---------- stats ---------- */

  /** Dashboard numbers for a given month (YYYY-MM), plus all-time totals. */
  function stats(state, month) {
    let earned = 0, collected = 0, unpaid = 0, paidHours = 0, volunteerHours = 0, sessionsCount = 0;
    let unpaidAll = 0, volunteerAll = 0;
    for (const s of state.sessions) {
      const c = clientById(state, s.clientId);
      const amt = sessionAmount(s, c);
      const hrs = (Number(s.minutes) || 0) / 60;
      const due = sessionDue(s, c);
      if (!s.volunteer && !s.paid) unpaidAll += due;
      if (s.volunteer) volunteerAll += hrs;
      if (month && monthKey(s.date) !== month) continue;
      sessionsCount++;
      if (s.volunteer) { volunteerHours += hrs; continue; }
      paidHours += hrs;
      earned += amt;
      collected += amt - due; unpaid += due;
    }
    return {
      earned: cents(earned), collected: cents(collected), unpaid: cents(unpaid),
      paidHours: cents(paidHours), volunteerHours: cents(volunteerHours), sessions: sessionsCount,
      unpaidAll: cents(unpaidAll), volunteerAll: cents(volunteerAll),
      effectiveRate: paidHours ? cents(earned / paidHours) : 0
    };
  }

  /** Earnings per month for the last n months ending at `endMonth` (YYYY-MM). */
  function monthlySeries(state, endMonth, n) {
    const [y, m] = endMonth.split('-').map(Number);
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      const key = d.toISOString().slice(0, 7);
      out.push({ month: key, earned: stats(state, key).earned });
    }
    return out;
  }

  /** Per-student balances, sorted by most owed, then by name. */
  function balances(state) {
    return state.clients
      .map(c => {
        const ss = state.sessions.filter(s => s.clientId === c.id);
        const unpaid = ss.filter(s => !s.paid && !s.volunteer);
        const owed = dueTotal(unpaid, c);
        const last = ss.map(s => s.date).sort().pop() || null;
        const oldestUnpaid = unpaid.map(s => s.date).sort()[0] || null;
        // Part payments already received on the still-unpaid sessions, and what those sessions cost in full ("$10.00 of $25.00 paid").
        const partPaid = cents(unpaid.reduce((a, s) => a + Math.round((Number(s.partPaid) || 0) * 100), 0) / 100);
        const unpaidBilled = cents(unpaid.reduce((a, s) => a + Math.round(sessionAmount(s, c) * 100), 0) / 100);
        return { client: c, owed: cents(owed), sessions: ss.length, unpaidSessions: unpaid.length, lastSession: last, oldestUnpaid, partPaid, unpaidBilled };
      })
      .sort((a, b) => b.owed - a.owed || String(a.client.name).localeCompare(String(b.client.name)));
  }

  /** Most recent session for a student (used for one-tap "repeat last session"). */
  function lastSession(state, clientId) {
    return state.sessions.filter(s => s.clientId === clientId).sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  }

  /** Service-hour progress toward an optional goal (e.g. an NHS chapter requirement). */
  function serviceProgress(state) {
    const hours = stats(state).volunteerAll;
    const goal = Number(state.profile.serviceGoal) > 0 ? Number(state.profile.serviceGoal) : 0;
    return { hours, goal, pct: goal ? Math.min(100, Math.round((hours / goal) * 100)) : 0, remaining: goal ? cents(Math.max(0, goal - hours)) : 0 };
  }

  /** Date range presets for parent updates, relative to `today` (YYYY-MM-DD). */
  function rangePreset(name, today) {
    switch (name) {
      case 'month': return { from: today.slice(0, 8) + '01', to: today };
      case 'last90': return { from: addDays(today, -89), to: today };
      case 'all': return { from: '', to: '' };
      case 'last30':
      default: return { from: addDays(today, -29), to: today };
    }
  }

  /* ---------- Smart progress report (rule-based NLG, runs offline, no paid API) ---------- */

  // Each entry is a regex source matched on word boundaries. Order matters: longer phrases first,
  // and a matched span is blanked out so "needs more review" counts once, not twice.
  const POSITIVE = [
    'got it', 'figured (it )?out', 'much better', 'improv(e|ed|es|ing|ement)', 'master(ed|ing|s)?', 'solid',
    'confident(ly)?', 'great', 'strong', 'aced', 'better', 'quick(ly)?', 'understood', 'nailed', 'independent(ly)?',
    'accurate(ly)?', 'progress(ed|ing)?', 'fluent(ly)?', 'excellent', 'perfect'
  ];
  const STRUGGLE = [
    'needs? (more )?(practice|review|work|help)', 'struggl(e|ed|es|ing)', 'confus(ed|ing|ion)', 'stuck', 'mistakes?',
    'slow(ly)?', 'careless', 'hard', 'difficult(y)?', 'weak', 'forgot', 'trouble', 'unsure', 'review', 'errors?', 'lost'
  ];
  const NEGATION = /\b(not|no|never|isn't|wasn't|aren't|didn't|don't|doesn't|hardly)\s+(\w+\s+){0,2}$/;

  function countSignals(clause, patterns) {
    let text = ' ' + clause + ' ';
    let pos = 0, neg = 0; // pos = signal counted as-is, neg = signal flipped by negation
    for (const src of patterns) {
      const re = new RegExp('\\b(' + src + ')\\b', 'g');
      let m;
      while ((m = re.exec(text))) {
        const before = text.slice(0, m.index);
        if (NEGATION.test(before)) neg++; else pos++;
        text = text.slice(0, m.index) + ' '.repeat(m[0].length) + text.slice(m.index + m[0].length);
        re.lastIndex = m.index + m[0].length;
      }
    }
    return { pos, neg };
  }

  /** Score free-text notes for progress vs. struggle signals, with simple negation handling. */
  function sentiment(notes) {
    const clauses = String(notes || '').toLowerCase().split(/[.!?;,]+|\bbut\b/);
    let pos = 0, neg = 0;
    for (const cl of clauses) {
      if (!cl.trim()) continue;
      const p = countSignals(cl, POSITIVE);
      const s = countSignals(cl, STRUGGLE);
      pos += p.pos + s.neg; // "not confused" reads as a positive signal
      neg += s.pos + p.neg; // "not confident" reads as a struggle signal
    }
    return { pos, neg };
  }

  function topicList(sessions) {
    const counts = new Map();
    sessions.forEach((s, idx) => {
      String(s.topics || '').split(/[,;]+/).map(t => t.trim()).filter(Boolean).forEach(t => {
        const key = t.toLowerCase();
        const prev = counts.get(key);
        counts.set(key, { label: prev ? prev.label : t, n: (prev ? prev.n : 0) + 1, last: idx });
      });
    });
    return [...counts.values()].sort((a, b) => b.n - a.n || b.last - a.last).map(x => x.label);
  }

  function joinList(arr) {
    if (arr.length <= 1) return arr.join('');
    if (arr.length === 2) return arr[0] + ' and ' + arr[1];
    return arr.slice(0, -1).join(', ') + ', and ' + arr[arr.length - 1];
  }

  /** Tidy a note into a sentence: trimmed, capitalised, ends with punctuation. */
  function sentence(note) {
    let t = String(note || '').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    t = t.charAt(0).toUpperCase() + t.slice(1);
    return /[.!?]$/.test(t) ? t : t + '.';
  }

  /**
   * Build a parent-ready progress update from logged sessions in [from, to].
   * Deterministic, explainable, and private: nothing leaves the device.
   */
  function progressReport(state, clientId, from, to) {
    const c = clientById(state, clientId);
    if (!c) return '';
    const ss = state.sessions
      .filter(s => s.clientId === clientId && (!from || s.date >= from) && (!to || s.date <= to))
      .sort((a, b) => a.date.localeCompare(b.date));
    const tutor = state.profile.name || 'Your tutor';
    const first = String(c.name).trim().split(/\s+/)[0];
    const greeting = c.parentName ? 'Hi ' + c.parentName + ',' : 'Hi,';
    if (!ss.length) {
      return greeting + '\n\nNo sessions with ' + first + ' were logged in this period yet. I will send an update after our next session.\n\nThanks,\n' + tutor;
    }
    const minutes = ss.reduce((a, s) => a + (Number(s.minutes) || 0), 0);
    const topics = topicList(ss);
    // Each session votes +1 (progress), -1 (struggle) or 0, weighted by recency so the latest sessions count most.
    let score = 0, weightSum = 0, signals = 0, lastWin = -1, lastFocus = -1;
    ss.forEach((s, i) => {
      const sv = sentiment(s.notes);
      const w = i + 1;
      weightSum += w;
      signals += sv.pos + sv.neg;
      if (sv.pos > sv.neg) { score += w; lastWin = i; }
      else if (sv.neg > sv.pos) { score -= w; lastFocus = i; }
    });
    const net = weightSum ? score / weightSum : 0; // -1 .. 1
    const turnedAround = lastFocus >= 0 && lastWin > lastFocus;
    let trend;
    if (!signals) trend = first + ' is attending regularly and we are working through the material together.';
    else if (turnedAround) trend = first + ' is making progress, and earlier challenges are turning around.';
    else if (net >= 0.3) trend = first + ' is making clear progress and gaining confidence.';
    else if (net <= -0.3) trend = first + ' is working through some challenging material, and we are building a stronger foundation.';
    else trend = first + ' is progressing steadily, with a mix of wins and areas to keep practicing.';

    const lines = [greeting, ''];
    const span = ss.length === 1 ? 'on ' + fmtDate(ss[0].date) : 'from ' + fmtDate(ss[0].date) + ' to ' + fmtDate(ss[ss.length - 1].date);
    lines.push('Here is a quick update on ' + first + "'s " + (c.subject ? c.subject + ' ' : '') + 'tutoring ' + span + '.', '');
    lines.push('• Sessions: ' + ss.length + ' (' + plural(cents(minutes / 60), 'hour') + ' total)');
    if (topics.length) lines.push('• Covered: ' + joinList(topics.slice(0, 6)));
    lines.push('• Overall: ' + trend);
    if (lastWin >= 0) lines.push('• Highlight: ' + sentence(ss[lastWin].notes));
    if (lastFocus > lastWin) {
      lines.push('• Next focus: ' + sentence(ss[lastFocus].notes));
    } else {
      const nextTopics = String(ss[ss.length - 1].topics || '').split(/[,;]+/).map(t => t.trim()).filter(Boolean);
      if (nextTopics.length) lines.push('• Next up: building on ' + joinList(nextTopics.slice(0, 2)) + '.');
    }
    const owed = dueTotal(ss.filter(s => !s.paid && !s.volunteer), c);
    if (owed > 0) {
      const pay = paymentSentence(state.profile);
      lines.push('', 'Balance for these sessions: ' + money(owed) + '.' + (pay ? ' ' + pay : ''));
    }
    lines.push('', 'Let me know if there is anything you would like me to focus on next.', '', 'Thanks,', tutor);
    const footer = referralFooter(state.profile);
    if (footer) lines.push('', '--', footer);
    return lines.join('\n');
  }

  /* ---------- payment wording & referral footer ---------- */

  const APP_URL = 'https://aariv.me/Tutorloop/';
  const PAY_METHODS = ['Venmo', 'Zelle', 'PayPal', 'Cash App'];

  /**
   * Best guess at the payment app from the handle alone, used when the tutor leaves
   * "Payment app" blank: $cashtag -> Cash App, paypal.me -> PayPal, @handle -> Venmo,
   * email or phone number -> Zelle. Returns '' when it can't tell.
   */
  function guessPayMethod(handle) {
    const h = String(handle || '').trim();
    if (!h) return '';
    if (/^\$[A-Za-z]/.test(h)) return 'Cash App';
    if (/paypal\.me|paypal\.com/i.test(h)) return 'PayPal';
    if (/^@[\w.-]+$/.test(h)) return 'Venmo';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(h) || /^\+?[\d\s().-]{7,}$/.test(h)) return 'Zelle';
    return '';
  }

  /**
   * "Venmo @aariv-tutoring": the payment app label plus the handle, or '' with no handle.
   * The label is the tutor's own "Payment app" setting, else a guess from the handle. If the handle
   * already names an app ("Zelle: me@x.com"), it is used as-is so the label is never doubled.
   */
  function paymentText(profile) {
    const p = profile || {};
    const handle = String(p.venmo || '').trim();
    if (!handle) return '';
    if (/\b(venmo|zelle|paypal|cash ?app)\b/i.test(handle)) return handle;
    const label = String(p.payMethod || '').trim() || guessPayMethod(handle);
    return label ? label + ' ' + handle : handle;
  }

  /** The sentence used in reminders and parent updates, or '' with no handle. */
  function paymentSentence(profile) {
    const t = paymentText(profile);
    if (!t) return '';
    const end = /[.!?]$/.test(t) ? '' : '.';
    // Free-form text with no app named ("cash at the session") reads better as a label than after "pay with".
    const named = /\b(venmo|zelle|paypal|cash ?app)\b/i.test(t) || t !== String(profile.venmo || '').trim();
    return (named ? 'You can pay with ' : 'Payment: ') + t + end;
  }

  /** Opt-in footer. A plain link: no tracking, no referral code, nothing personal. */
  function referralFooter(profile) {
    return profile && profile.referralFooter ? 'Sent with TutorLoop, a free app for student tutors: ' + APP_URL : '';
  }

  /** A polite payment reminder for a family's unpaid sessions. Returns '' when nothing is owed. */
  const REMINDER_MAX_LINES = 12;

  function reminderMessage(state, clientId) {
    const c = clientById(state, clientId);
    if (!c) return '';
    const items = state.sessions.filter(s => s.clientId === clientId && !s.paid && !s.volunteer)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!items.length) return '';
    const total = dueTotal(items, c);
    const first = String(c.name).trim().split(/\s+/)[0];
    const lines = [c.parentName ? 'Hi ' + c.parentName + ',' : 'Hi,', '',
      'Just a friendly reminder about ' + first + "'s tutoring balance of " + money(total) + ' for ' + plural(items.length, 'session') + ':', ''];
    // A long backlog (say 60 unpaid sessions) would make a message too long for an email link, so the oldest ones roll up into one line. The total above always covers every session.
    const listed = items.length > REMINDER_MAX_LINES ? items.slice(items.length - REMINDER_MAX_LINES) : items;
    const rolled = items.slice(0, items.length - listed.length);
    if (rolled.length) lines.push('• ' + plural(rolled.length, 'earlier session') + ' (' + fmtDate(rolled[0].date) + ' to ' + fmtDate(rolled[rolled.length - 1].date) + '): ' + money(dueTotal(rolled, c)));
    listed.forEach(s => lines.push('• ' + fmtDate(s.date) + ': ' + s.minutes + ' min' + (s.topics ? ' (' + s.topics + ')' : '') + ', ' + (Number(s.partPaid) > 0 ? money(sessionDue(s, c)) + ' left (' + money(s.partPaid) + ' already paid of ' + money(sessionAmount(s, c)) + ')' : money(sessionAmount(s, c)))));
    lines.push('');
    const pay = paymentSentence(state.profile);
    if (pay) lines.push(pay);
    lines.push('No rush if you have already sent it. Thank you!', '', state.profile.name || 'Your tutor');
    const footer = referralFooter(state.profile);
    if (footer) lines.push('', '--', footer);
    return lines.join('\n');
  }

  /* ---------- monthly summary (parents, sponsors, the tutor's own records) ---------- */

  /** Months that have sessions, newest first, always including `current` (YYYY-MM). */
  function summaryMonths(state, current) {
    const set = new Set(state.sessions.map(s => monthKey(s.date)).filter(Boolean));
    if (current) set.add(current);
    return [...set].sort().reverse();
  }

  /**
   * One month in numbers, for every student (clientId falsy) or one student.
   * "Paid" and "unpaid" are each session's current status. `payments` lists the amounts recorded with
   * "Record a payment" whose date falls in the month (sessions marked paid directly have no payment entry).
   */
  function monthSummary(state, month, clientId) {
    const ss = state.sessions
      .filter(s => monthKey(s.date) === month && (!clientId || s.clientId === clientId))
      .sort((a, b) => a.date.localeCompare(b.date));
    const blank = () => ({ sessions: 0, paidSessions: 0, volunteerSessions: 0, minutes: 0, paidMinutes: 0, volunteerMinutes: 0, billed: 0, paid: 0, unpaid: 0 });
    const totals = blank();
    const per = new Map();
    for (const s of ss) {
      const c = clientById(state, s.clientId);
      if (!per.has(s.clientId)) per.set(s.clientId, Object.assign(blank(), { client: c || { id: s.clientId, name: 'Unknown student' }, list: [] }));
      const row = per.get(s.clientId);
      const min = Number(s.minutes) || 0, amt = sessionAmount(s, c), due = sessionDue(s, c);
      for (const t of [totals, row]) {
        t.sessions++; t.minutes += min;
        if (s.volunteer) { t.volunteerSessions++; t.volunteerMinutes += min; }
        else { t.paidSessions++; t.paidMinutes += min; t.billed += amt; t.paid += amt - due; t.unpaid += due; }
      }
      row.list.push(s);
    }
    const finish = t => Object.assign(t, { hours: cents(t.minutes / 60), paidHours: cents(t.paidMinutes / 60), volunteerHours: cents(t.volunteerMinutes / 60), billed: cents(t.billed), paid: cents(t.paid), unpaid: cents(t.unpaid) });
    finish(totals);
    const students = [...per.values()].map(r => { finish(r); r.topics = topicList(r.list); delete r.list; return r; })
      .sort((a, b) => String(a.client.name).localeCompare(String(b.client.name)));
    let balanceAll = null;
    if (clientId) {
      const c = clientById(state, clientId);
      balanceAll = dueTotal(state.sessions.filter(s => s.clientId === clientId && !s.paid && !s.volunteer), c);
    }
    const payments = (state.payments || []).filter(x => monthKey(x.date) === month && (!clientId || x.clientId === clientId))
      .sort((a, b) => a.date.localeCompare(b.date));
    const paymentsTotal = cents(payments.reduce((a, x) => a + Math.round(cents(x.amount) * 100), 0) / 100);
    return { month, clientId: clientId || '', totals, students, sessions: ss, topics: topicList(ss), balanceAll, payments, paymentsTotal };
  }

  /**
   * Plain-text version of a monthly summary: a statement for one family, or a recap of the whole
   * month for the tutor (or a sponsor) when no student is picked.
   */
  function summaryText(state, month, clientId) {
    const m = monthSummary(state, month, clientId);
    const t = m.totals;
    const label = fmtMonth(month);
    const tutor = state.profile.name || 'Your tutor';
    const lines = [];
    if (clientId) {
      const c = clientById(state, clientId);
      if (!c) return '';
      const first = String(c.name).trim().split(/\s+/)[0];
      lines.push(c.parentName ? 'Hi ' + c.parentName + ',' : 'Hi,', '');
      if (!t.sessions) {
        lines.push('There were no tutoring sessions with ' + first + ' in ' + label + '.');
      } else {
        lines.push('Here is ' + first + "'s " + (c.subject ? c.subject + ' ' : '') + 'tutoring summary for ' + label + '.', '');
        lines.push('• Sessions: ' + t.sessions + ' (' + plural(t.hours, 'hour') + ')');
        if (t.volunteerSessions) lines.push('• Volunteer (no charge): ' + plural(t.volunteerSessions, 'session') + ', ' + plural(t.volunteerHours, 'hour'));
        if (m.topics.length) lines.push('• Covered: ' + joinList(m.topics.slice(0, 8)));
        lines.push('', 'Session log:');
        m.sessions.forEach(s => lines.push('• ' + fmtDate(s.date) + ': ' + s.minutes + ' min' + (s.topics ? ' (' + s.topics + ')' : '') +
          (s.volunteer ? ', volunteer' : ', ' + money(sessionAmount(s, c)) + (s.paid ? ', paid' : ', unpaid'))));
        if (t.paidSessions) {
          lines.push('', 'Charges for ' + label + ': ' + money(t.billed) + ' (paid ' + money(t.paid) + ', unpaid ' + money(t.unpaid) + ').');
          if (m.balanceAll > 0) {
            const pay = paymentSentence(state.profile);
            lines.push('Total balance due today: ' + money(m.balanceAll) + '.' + (pay ? ' ' + pay : ''));
          } else lines.push('Nothing is due. Thank you!');
        }
      }
      if (m.payments.length) {
        lines.push('', 'Payments received in ' + label + ':');
        m.payments.forEach(x => lines.push('• ' + fmtDate(x.date) + ': ' + money(x.amount)));
        if (m.payments.length > 1) lines.push('Total received: ' + money(m.paymentsTotal));
      }
      lines.push('', 'Thanks,', tutor);
    } else {
      lines.push('Tutoring summary for ' + label + (state.profile.business ? ' · ' + state.profile.business : '') + (state.profile.name ? ' · ' + state.profile.name : ''), '');
      if (!t.sessions) lines.push('No sessions were logged in ' + label + '.');
      else {
        lines.push('• Sessions: ' + t.sessions + ' with ' + plural(m.students.length, 'student') + ' (' + plural(t.hours, 'hour') + ')');
        lines.push('• Paid tutoring: ' + plural(t.paidHours, 'hour') + ', ' + money(t.billed) + ' charged, ' + money(t.paid) + ' paid, ' + money(t.unpaid) + ' unpaid');
        lines.push('• Volunteer tutoring (service hours): ' + plural(t.volunteerHours, 'hour') + ' in ' + plural(t.volunteerSessions, 'session'));
        lines.push('', 'By student:');
        m.students.forEach(r => lines.push('• ' + r.client.name + ': ' + plural(r.sessions, 'session') + ', ' + plural(r.hours, 'hour') +
          (r.paidSessions ? ', ' + money(r.billed) + ' charged' + (r.unpaid ? ' (' + money(r.unpaid) + ' unpaid)' : '') : '') +
          (r.volunteerSessions ? ', ' + plural(r.volunteerHours, 'volunteer hour') : '')));
      }
    }
    const footer = referralFooter(state.profile);
    if (footer) lines.push('', '--', footer);
    return lines.join('\n');
  }

  /**
   * What the Pro price means in this tutor's own terms: minutes of tutoring at their average paid
   * rate. Returns null until there is a paid rate to compare against.
   */
  function proValue(state, price) {
    let mins = 0, amt = 0;
    for (const s of state.sessions) { if (s.volunteer) continue; const a = sessionAmount(s, clientById(state, s.clientId)); if (a > 0) { mins += Number(s.minutes) || 0; amt += a; } }
    if (!mins || !amt) return null;
    const rate = cents(amt / (mins / 60));
    return { rate, minutes: Math.max(1, Math.round(price / rate * 60)) };
  }

  /** Short stable hash for readable IDs. */
  function shortHash(str) {
    let h = 0;
    for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h.toString(36).toUpperCase().slice(-4).padStart(4, '0');
  }

  /** Invoice data for unpaid, non-volunteer sessions of one student. */
  function invoice(state, clientId, today) {
    const c = clientById(state, clientId);
    if (!c) return null;
    const items = state.sessions
      .filter(s => s.clientId === clientId && !s.paid && !s.volunteer)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(s => ({ id: s.id, date: s.date, minutes: Number(s.minutes), topics: s.topics || '', amount: sessionDue(s, c), full: sessionAmount(s, c), partPaid: Number(s.partPaid) > 0 ? cents(s.partPaid) : 0 }));
    const total = cents(items.reduce((a, i) => a + Math.round(i.amount * 100), 0) / 100);
    const stamp = String(today || (items.length ? items[items.length - 1].date : '')).replace(/-/g, '');
    return { client: c, items, total, number: 'INV-' + stamp + '-' + shortHash(clientId + items.map(i => i.id).join('|')) };
  }

  /**
   * Escape one CSV cell. Also neutralises spreadsheet formula injection (OWASP): a cell that starts
   * with = + - @ tab or CR gets a leading apostrophe so Excel/Sheets shows it as text.
   */
  function csvEscape(v) {
    let s = String(v == null ? '' : v);
    if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(rows) { return rows.map(r => r.map(csvEscape).join(',')).join('\r\n'); }

  /** Volunteer hours log (for NHS / service-hour requirements). */
  function volunteerCSV(state) {
    const rows = [['Date', 'Student', 'Subject', 'Minutes', 'Hours', 'Topics']];
    let total = 0;
    state.sessions.filter(s => s.volunteer).sort((a, b) => a.date.localeCompare(b.date)).forEach(s => {
      const c = clientById(state, s.clientId) || {};
      const hrs = cents(Number(s.minutes) / 60);
      total += Number(s.minutes) / 60;
      rows.push([s.date, c.name || '', c.subject || '', Number(s.minutes), hrs, s.topics || '']);
    });
    rows.push(['Total', '', '', '', cents(total), '']);
    return toCSV(rows);
  }

  function sessionsCSV(state) {
    const rows = [['Date', 'Student', 'Minutes', 'Rate', 'Amount', 'Paid', 'Volunteer', 'Topics', 'Notes', 'Part paid']];
    state.sessions.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(s => {
      const c = clientById(state, s.clientId) || {};
      rows.push([s.date, c.name || '', Number(s.minutes), s.rate != null && s.rate !== '' ? Number(s.rate) : Number(c.rate) || 0, sessionAmount(s, c),
        s.paid ? 'yes' : 'no', s.volunteer ? 'yes' : 'no', s.topics || '', s.notes || '', !s.paid && Number(s.partPaid) > 0 ? cents(s.partPaid) : 0]);
    });
    return toCSV(rows);
  }

  /* ---------- import / migration ---------- */

  const str = (v, max) => (v == null ? '' : String(v)).slice(0, max || 500);

  /** Validate, normalise, and migrate imported JSON. Throws an Error with a friendly message on bad input. */
  function importState(json) {
    let data;
    try { data = typeof json === 'string' ? JSON.parse(json) : json; }
    catch (e) { throw new Error('That file is not valid JSON. Choose a TutorLoop backup (.json) file.'); }
    if (!data || typeof data !== 'object' || !Array.isArray(data.clients) || !Array.isArray(data.sessions)) {
      throw new Error('That file is not a TutorLoop backup.');
    }
    if (Number(data.version) > SCHEMA_VERSION) throw new Error('This backup was made by a newer version of TutorLoop.');
    const base = emptyState();
    const p = data.profile && typeof data.profile === 'object' ? data.profile : {};
    const profile = {
      name: str(p.name, 80), business: str(p.business, 100), email: str(p.email, 120), venmo: str(p.venmo, 80),
      payMethod: str(p.payMethod, 30).trim(), referralFooter: p.referralFooter === true,
      plan: ['free', 'pro', 'club'].includes(p.plan) ? p.plan : base.profile.plan,
      serviceGoal: Number(p.serviceGoal) > 0 ? Math.min(1000, Number(p.serviceGoal)) : ''
    };
    const seen = new Set();
    const clients = data.clients.filter(c => c && c.id && c.name && !seen.has(String(c.id)) && seen.add(String(c.id))).map(c => ({
      id: String(c.id), name: str(c.name, 80), subject: str(c.subject, 80), grade: str(c.grade, 20),
      rate: Math.max(0, Number(c.rate) || 0), parentName: str(c.parentName, 80), parentEmail: str(c.parentEmail, 120),
      volunteerDefault: !!c.volunteerDefault, archived: !!c.archived
    }));
    const ids = new Set(clients.map(c => c.id));
    const sids = new Set();
    const sessions = data.sessions.filter(s => s && s.id && ids.has(String(s.clientId)) && isValidDate(s.date) &&
      Number(s.minutes) > 0 && Number(s.minutes) <= MAX_MINUTES && !sids.has(String(s.id)) && sids.add(String(s.id))).map(s => ({
      id: String(s.id), clientId: String(s.clientId), date: s.date, minutes: Number(s.minutes),
      rate: s.rate == null || s.rate === '' || isNaN(Number(s.rate)) ? null : Math.max(0, Number(s.rate)),
      topics: str(s.topics, 300), notes: str(s.notes, 2000), paid: !!s.paid, volunteer: !!s.volunteer,
      partPaid: !s.paid && !s.volunteer && Number(s.partPaid) > 0 ? Math.min(cents(s.partPaid), 1e6) : 0
    }));
    sessions.forEach(s => { if (!s.partPaid) delete s.partPaid; });
    const pids = new Set();
    const payments = (Array.isArray(data.payments) ? data.payments : []).filter(x => x && x.id && ids.has(String(x.clientId)) && isValidDate(x.date) &&
      Number(x.amount) > 0 && !pids.has(String(x.id)) && pids.add(String(x.id))).slice(0, 5000).map(x => ({ id: String(x.id), clientId: String(x.clientId), date: x.date, amount: Math.min(cents(x.amount), 1e6) }));
    const out = { version: SCHEMA_VERSION, profile, clients, sessions, payments };
    settleCovered(out);   // a backup made before edits settled covered sessions: same rule as the app
    if (data.sample === true) out.sample = true;   // made with "Try it with sample data"; the app shows a "Start fresh" bar
    return out;
  }

  /* ---------- part payments ---------- */

  const MAX_PAYMENT = 100000;

  /**
   * Plan a payment toward one family's balance. It is applied oldest session first: each session it
   * fully covers becomes paid, and what is left over is kept as a part payment on the next-oldest one.
   * A payment larger than the balance is refused (TutorLoop does not hold prepayments). Pure: it
   * changes nothing; applyPayment() does.
   */
  function planPayment(state, clientId, amount) {
    const c = clientById(state, clientId);
    if (!c) return { ok: false, error: 'Pick a student.' };
    const raw = Number(amount);
    if (amount === '' || amount == null || !Number.isFinite(raw) || raw <= 0) return { ok: false, error: 'Enter an amount greater than $0.' };
    if (raw > MAX_PAYMENT) return { ok: false, error: 'Payments can be up to ' + money(MAX_PAYMENT) + '.' };
    const paying = Math.round(cents(raw) * 100);
    if (paying <= 0) return { ok: false, error: 'Enter an amount of at least $0.01.' };
    const items = state.sessions.map((s, i) => ({ s, i })).filter(x => x.s.clientId === clientId && !x.s.paid && !x.s.volunteer && sessionDue(x.s, c) > 0)
      .sort((a, b) => a.s.date.localeCompare(b.s.date) || a.i - b.i).map(x => x.s);
    const owed = items.reduce((a, s) => a + Math.round(sessionDue(s, c) * 100), 0);
    if (!owed) return { ok: false, error: 'Nothing is owed for this student.' };
    if (paying > owed) return { ok: false, error: 'That is more than the ' + money(owed / 100) + ' owed. Enter ' + money(owed / 100) + ' or less.' };
    let left = paying;
    const steps = [];
    for (const s of items) {
      if (left <= 0) break;
      const due = Math.round(sessionDue(s, c) * 100);
      if (left >= due) { steps.push({ id: s.id, applied: due / 100, settles: true }); left -= due; }
      else { steps.push({ id: s.id, applied: left / 100, settles: false }); left = 0; }
    }
    return { ok: true, amount: paying / 100, owedBefore: owed / 100, owedAfter: (owed - paying) / 100, steps, settled: steps.filter(x => x.settles).length };
  }

  /** Apply a plan from planPayment() to the state and log it. */
  function applyPayment(state, clientId, plan, date) {
    if (!plan || !plan.ok) return state;
    for (const st of plan.steps) {
      const s = state.sessions.find(x => x.id === st.id); if (!s) continue;
      if (st.settles) { s.paid = true; delete s.partPaid; }
      else s.partPaid = cents((Number(s.partPaid) || 0) + st.applied);
    }
    if (!Array.isArray(state.payments)) state.payments = [];
    state.payments.push({ id: uid('p'), clientId, date, amount: plan.amount });
    return state;
  }

  /**
   * Money already received is never silently dropped. When a session's part payment no longer has a
   * home (the session was edited down below what was paid, made volunteer, or deleted, or the student's
   * rate was lowered), the extra moves to the family's oldest unpaid sessions, the same way "Record a
   * payment" spends money. Whatever is left after every session is paid is returned as `leftover`
   * (TutorLoop does not hold credit), so the app can say so. All amounts are whole cents internally.
   */
  function carryCredit(state, clientId, amount) {
    const c = clientById(state, clientId);
    let left = Math.round(cents(amount) * 100);
    if (!c || left <= 0) return { moved: 0, leftover: cents(Math.max(0, left) / 100), settled: 0 };
    const start = left; let settled = 0;
    const items = state.sessions.map((s, i) => ({ s, i })).filter(x => x.s.clientId === clientId && !x.s.paid && !x.s.volunteer && sessionDue(x.s, c) > 0)
      .sort((a, b) => a.s.date.localeCompare(b.s.date) || a.i - b.i).map(x => x.s);
    for (const s of items) {
      if (left <= 0) break;
      const due = Math.round(sessionDue(s, c) * 100);
      if (left >= due) { s.paid = true; delete s.partPaid; left -= due; settled++; }
      else { s.partPaid = cents(Math.round((Number(s.partPaid) || 0) * 100 + left) / 100); left = 0; }
    }
    return { moved: cents((start - left) / 100), leftover: cents(left / 100), settled };
  }

  /**
   * Make sure no session is "unpaid" while its part payments already cover it: such a session becomes
   * paid, and anything paid beyond its cost is carried to the family's next unpaid sessions.
   * Returns { settled, moved, leftover } (dollars) for a friendly message; changes nothing when all is consistent.
   */
  function settleCovered(state) {
    const out = { settled: 0, moved: 0, leftover: 0 };
    for (let guard = 0; guard < 10000; guard++) {
      const s = state.sessions.find(x => !x.paid && !x.volunteer && Number(x.partPaid) > 0 &&
        Math.round(Number(x.partPaid) * 100) >= Math.round(sessionAmount(x, clientById(state, x.clientId)) * 100));
      if (!s) break;
      const extra = Math.round(Number(s.partPaid) * 100) - Math.round(sessionAmount(s, clientById(state, s.clientId)) * 100);
      s.paid = true; delete s.partPaid; out.settled++;
      const r = carryCredit(state, s.clientId, extra / 100);
      out.settled += r.settled; out.moved = cents(out.moved + r.moved); out.leftover = cents(out.leftover + r.leftover);
    }
    return out;
  }

  /** Log a new session. */
  function addSession(state, rec) {
    state.sessions.push(Object.assign({ id: uid('s') }, rec));
    return { settled: 0, moved: 0, leftover: 0 };
  }

  /**
   * Save an edited session (the Log form). A session saved as paid keeps no part payment (paid in full
   * covers it). Saved as volunteer, or cheaper than what was already paid toward it, the money already
   * received moves to the family's other unpaid sessions instead of vanishing. Returns what moved.
   */
  function editSession(state, id, rec) {
    const s = state.sessions.find(x => x.id === id);
    if (!s) return { settled: 0, moved: 0, leftover: 0 };
    const oldClient = s.clientId, prior = Number(s.partPaid) > 0 ? cents(s.partPaid) : 0;
    Object.assign(s, rec);
    let carry = { settled: 0, moved: 0, leftover: 0 };
    if (s.paid) delete s.partPaid;
    else if (prior && (s.volunteer || s.clientId !== oldClient)) { delete s.partPaid; carry = carryCredit(state, oldClient, prior); }
    const more = settleCovered(state);
    return { settled: carry.settled + more.settled, moved: cents(carry.moved + more.moved), leftover: cents(carry.leftover + more.leftover) };
  }

  /** The Paid toggle. Marking paid drops the part payment (paid in full covers it). */
  function setPaid(state, id, paid) {
    const s = state.sessions.find(x => x.id === id);
    if (!s || s.volunteer) return;
    s.paid = !!paid;
    if (s.paid) delete s.partPaid;
  }

  /** Delete a session. A part payment on it moves to the family's other unpaid sessions. */
  function deleteSession(state, id) {
    const s = state.sessions.find(x => x.id === id);
    state.sessions = state.sessions.filter(x => x.id !== id);
    if (!s || s.paid || s.volunteer || !(Number(s.partPaid) > 0)) return { settled: 0, moved: 0, leftover: 0 };
    return carryCredit(state, s.clientId, s.partPaid);
  }

  /** One short sentence for the toast after money moved, or '' when nothing did. */
  function creditNote(r) {
    if (!r) return '';
    const parts = [];
    if (r.moved > 0) parts.push(money(r.moved) + ' already paid now counts toward other unpaid sessions');
    if (r.leftover > 0) parts.push(money(r.leftover) + ' already paid is more than anything owed: refund it or note it');
    return parts.length ? parts.join('. ') + '.' : '';
  }

  /* ---------- demo data ---------- */

  /** Realistic, clearly fictional demo data relative to `today` (YYYY-MM-DD). */
  function demoState(today) {
    const day = n => addDays(today, -n);
    const st = emptyState();
    st.profile = { name: 'Aariv Patel', business: 'Aariv Math Tutoring', email: 'tutor@example.com', venmo: '@aariv-tutoring', payMethod: 'Venmo', referralFooter: false, plan: 'free', serviceGoal: 10 };
    const maya = { id: 'c_maya', name: 'Maya Chen', subject: 'Algebra 1', grade: '8', rate: 25, parentName: 'Mrs. Chen', parentEmail: 'parent.chen@example.com' };
    const ethan = { id: 'c_ethan', name: 'Ethan Brooks', subject: 'MATHCOUNTS prep', grade: '7', rate: 30, parentName: 'Mr. Brooks', parentEmail: 'brooks.family@example.com' };
    const sofia = { id: 'c_sofia', name: 'Sofia Ramirez', subject: 'Geometry', grade: '9', rate: 0, parentName: 'Ms. Ramirez', parentEmail: '', volunteerDefault: true };
    st.clients.push(maya, ethan, sofia);
    let n = 0;
    const add = (c, d, min, topics, notes, paid, vol) => st.sessions.push({ id: 's_demo' + (++n), clientId: c.id, date: day(d), minutes: min, rate: null, topics, notes, paid: !!paid, volunteer: !!vol });
    add(maya, 60, 60, 'linear equations, slope', 'Struggled with negative slopes, needs more practice', true);
    add(maya, 46, 60, 'slope-intercept form', 'Better with graphing, still careless with signs', true);
    add(maya, 32, 60, 'systems of equations', 'Got it quickly, confident with substitution', true);
    add(maya, 18, 60, 'systems of equations, word problems', 'Word problems were hard, needs review on setup', false);
    add(maya, 4, 60, 'word problems, inequalities', 'Improved a lot on word problems, set up every equation on her own', true);
    add(ethan, 40, 90, 'counting, probability', 'Strong intuition on counting problems', true);
    add(ethan, 25, 90, 'number theory, primes', 'Aced the sprint round practice set', true);
    add(ethan, 11, 90, 'geometry, area', 'Slow on area problems, review similar triangles', false);
    add(ethan, 2, 90, 'similar triangles, target round', 'Much better, quick and confident on similar triangles', false);
    add(sofia, 35, 45, 'proofs', 'Confused by two-column proofs', false, true);
    add(sofia, 20, 45, 'proofs, congruence', 'Better at congruence shortcuts', false, true);
    add(sofia, 6, 45, 'triangle congruence', 'Solid on SAS and ASA now', false, true);
    st.sample = true;
    return st;
  }

  const api = {
    SCHEMA_VERSION, FREE_CLIENT_LIMIT, MAX_MINUTES, uid, emptyState, cents, money, plural, isValidDate, addDays,
    sessionAmount, sessionDue, planPayment, applyPayment, carryCredit, settleCovered, addSession, editSession, setPaid, deleteSession, creditNote, MAX_PAYMENT, clientById, validateClient, validateSession, duplicateNames, duplicateNamesWarning, clientLabel, stats, monthlySeries, balances, lastSession,
    serviceProgress, rangePreset, topicList, sentiment, sentence, progressReport, reminderMessage, invoice,
    APP_URL, PAY_METHODS, guessPayMethod, paymentText, paymentSentence, referralFooter,
    csvEscape, volunteerCSV, sessionsCSV, importState, demoState, fmtDate, fmtMonth, monthKey,
    summaryMonths, monthSummary, summaryText, proValue
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TutorCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
