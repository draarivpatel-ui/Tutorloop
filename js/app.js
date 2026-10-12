/* TutorLoop UI: hash router + views. All state lives in this browser's localStorage. */
(function () {
  'use strict';
  const C = window.TutorCore;
  const KEY = 'tutorloop.v1';
  const $app = document.getElementById('app');
  const $banner = document.getElementById('banner');

  /* ---------- state & persistence ---------- */
  let storageOk = true;
  let state = load();

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { storageOk = false; return C.emptyState(); }
    if (!raw) return C.emptyState();
    try { return C.importState(raw); }
    catch (e) {
      // Never silently overwrite data we could not read: park the raw copy and tell the user.
      const parked = KEY + '.unreadable.' + Date.now();
      try { localStorage.setItem(parked, raw); localStorage.removeItem(KEY); } catch (_) { /* ignore */ }
      setTimeout(() => showBanner('We could not read your saved data, so TutorLoop started fresh. Your old data was kept in this browser under "' + parked + '".'), 0);
      return C.emptyState();
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); storageOk = true; return true; }
    catch (e) {
      storageOk = false;
      showBanner('Your browser blocked saving (private mode or storage full). Changes will be lost when you close this tab. Download a backup from Settings.');
      return false;
    }
  }

  /** Snapshot-based undo for any change. */
  function commit(msg, mutate, returnSel) {
    const before = JSON.stringify(state);
    const result = mutate();
    if (typeof msg === 'function') msg = msg(result);   // a message that depends on what changed (e.g. money moved)
    save();
    render();
    lastUndo = () => { lastUndo = null; state = C.importState(before); save(); render(); toast('Undone', null, returnSel); };
    toast(msg, lastUndo, returnSel);
  }
  let lastUndo = null;
  const withNote = (msg, r) => { const n = C.creditNote(r); return n ? msg + '. ' + n : msg; };

  // Ctrl/Cmd+Z undoes the last change when you're not typing in a field.
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && lastUndo && !e.target.closest('input, textarea, select, [contenteditable]')) {
      e.preventDefault(); const back = toastHasFocus(); hideToast(true); lastUndo(); if (back) toastReturnFocus();
    }
  });

  // Keep tabs in sync: another tab changed the data.
  window.addEventListener('storage', e => {
    if (e.key !== KEY) return;
    try { state = e.newValue ? C.importState(e.newValue) : C.emptyState(); } catch (_) { return; }
    // Don't wipe a half-filled form: tell the user instead.
    if (document.activeElement && document.activeElement.closest('form')) showBanner('Your data changed in another tab. Finish this form, then reload to see the latest.');
    else render();
  });

  /* ---------- helpers ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const thisMonth = () => today().slice(0, 7);
  const activeClients = () => state.clients.filter(c => !c.archived);
  const firstName = n => String(n || '').trim().split(/\s+/)[0];
  const yr = () => Number(today().slice(0, 4));
  const fd = d => C.fmtDate(d, yr());

  function showBanner(msg) {
    if (!$banner) return;
    $banner.innerHTML = '<span>' + esc(msg) + '</span><button class="btn small ghost" data-act="dismissBanner">Dismiss</button>';
    $banner.hidden = false;
  }

  /* Toasts auto-dismiss (8s with Undo, 3s without), pause while hovered or focused, close with the ×
   * button or Escape, and are fully removed afterwards (hidden + emptied) so no invisible Undo button
   * is left behind for keyboards, screen readers, or page scrapers. Ctrl/Cmd+Z still undoes after. */
  const TOAST_MS = { undo: 8000, plain: 3000 };
  let toastTimer, toastFade, toastLeft = 0, toastStart = 0, toastGen = 0;
  function toastEl() { return document.getElementById('toast'); }
  function armToast(ms) { clearTimeout(toastTimer); toastLeft = ms; toastStart = Date.now(); toastTimer = setTimeout(hideToast, ms); }
  // Keyboard users who Tab into the toast must not be dropped on <body> when it closes (Escape, ×, Undo):
  // focus goes back to where they came from (returnSel from the caller, else the element they tabbed in
  // from, else the page heading). Elements are re-rendered, so the selector is looked up afresh.
  let toastReturnSel = null, toastReturnEl = null;
  const toastHasFocus = () => { const t = toastEl(); return !!(t && t.contains(document.activeElement)); };
  function toastReturnFocus() {
    let el = toastReturnSel && document.querySelector(toastReturnSel);
    if (!el && toastReturnEl && toastReturnEl.isConnected) el = toastReturnEl;
    if (!el) el = document.querySelector('#app h1') || $app;
    if (el) el.focus({ preventScroll: true });
  }
  function hideToast(keepFocus) {
    const t = toastEl(); if (!t) return;
    if (keepFocus !== true && toastHasFocus()) toastReturnFocus();
    clearTimeout(toastTimer); clearTimeout(toastFade);
    t.classList.remove('show');
    const gen = toastGen;
    toastFade = setTimeout(() => { if (gen === toastGen) { t.hidden = true; t.innerHTML = ''; } }, 250);
  }
  function toast(msg, undo, returnSel) {
    const t = toastEl(); if (!t) return;
    const back = toastHasFocus();
    toastGen++; clearTimeout(toastFade);
    toastReturnSel = returnSel || null; toastReturnEl = null;
    t.innerHTML = '<span class="toast-msg">' + esc(msg) + '</span>' + (undo ? '<button type="button" class="toast-undo">Undo</button>' : '') +
      '<button type="button" class="toast-close" aria-label="Dismiss notification">&times;</button>';
    t.hidden = false;
    void t.offsetWidth;   // let the fade-in transition run after un-hiding
    t.classList.add('show');
    if (undo) t.querySelector('.toast-undo').addEventListener('click', () => { const b = toastHasFocus(); hideToast(true); if (undo === lastUndo) undo(); if (b) toastReturnFocus(); }, { once: true });
    t.querySelector('.toast-close').addEventListener('click', hideToast, { once: true });
    if (back) toastReturnFocus();   // the focused button was just replaced
    armToast(undo ? TOAST_MS.undo : TOAST_MS.plain);
  }
  (function wireToast() {
    const t = toastEl(); if (!t) return;
    const pause = () => { if (!t.classList.contains('show')) return; clearTimeout(toastTimer); toastLeft = Math.max(0, toastLeft - (Date.now() - toastStart)); };
    const resume = () => { if (t.classList.contains('show') && !t.matches(':hover') && !t.contains(document.activeElement)) armToast(Math.max(toastLeft, 2000)); };
    t.addEventListener('mouseenter', pause); t.addEventListener('focusin', pause);
    t.addEventListener('focusin', e => { if (e.relatedTarget && !t.contains(e.relatedTarget)) toastReturnEl = e.relatedTarget; });
    t.addEventListener('mouseleave', resume); t.addEventListener('focusout', () => setTimeout(resume, 0));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && t.classList.contains('show')) hideToast(); });
  })();

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Downloaded ' + name);
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
      ta.className = 'sr-only'; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
      ta.remove(); return ok;
    }
  }

  const MAILTO_MAX = 8000; // email apps and browsers drop or refuse much longer links; ordinary messages are well under this
  function mailto(to, subject, body) {
    const head = 'mailto:' + encodeURIComponent(to || '') + '?subject=' + encodeURIComponent(subject) + '&body=';
    let text = String(body || '');
    if ((head + encodeURIComponent(text)).length > MAILTO_MAX) {
      const note = '\n\n[Shortened to fit your email app. Use "Copy" in TutorLoop for the full text.]';
      const lines = text.split('\n');
      while (lines.length > 1 && (head + encodeURIComponent(lines.join('\n') + note)).length > MAILTO_MAX) lines.pop();
      text = lines.join('\n') + note;
    }
    return head + encodeURIComponent(text);
  }

  /** Settings preview of the exact payment sentence parents will see. Plain text (used via textContent too). */
  function payPreviewText(p) {
    const s = C.paymentSentence(p);
    return s ? 'Parents will see: "' + s + '"' : 'Add a handle and it will appear on invoices, reminders, and parent updates.';
  }

  function formData(form) {
    const o = {};
    new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; });
    form.querySelectorAll('input[type=checkbox]').forEach(cb => { o[cb.name] = cb.checked; });
    return o;
  }

  // Which field each validation message is about, so the field can say it is invalid and point at the message.
  const FIELD_FOR = [[/^Student name|student named/i, 'name'], [/^Hourly rate|^Rate override/i, 'rate'], [/^Parent email/i, 'parentEmail'],
    [/^Email/i, 'email'], [/^Pick a student/i, 'clientId'], [/\bdate\b|the year/i, 'date'], [/^Duration/i, 'minutes'], [/goal/i, 'serviceGoal']];
  /** Show a form's errors in its role=alert box. Multi-field forms move focus to the box; a one-field form passes
   *  that field as focusEl, so the user can fix it at once and the alert is read once (not again as the focused box). */
  function showErrors(form, errs, focusEl) {
    const box = form.querySelector('.form-errors');
    box.innerHTML = errs.length ? '<ul>' + errs.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>' : '';
    // Mark the fields the messages are about (WCAG 3.3.1) and point them at the message box; clear fields now fixed.
    if (!box.id) box.id = (form.id || 'form') + '-errors';
    const bad = new Set(errs.map(e => (FIELD_FOR.find(([re]) => re.test(e)) || [])[1]).filter(Boolean));
    Array.prototype.forEach.call(form.elements, el => {
      if (!el.name || el.id === 'pay-amount' || el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return;  // pay-amount is wired by hand
      const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(x => x && x !== box.id);
      if (bad.has(el.name)) { el.setAttribute('aria-invalid', 'true'); ids.push(box.id); }
      else el.removeAttribute('aria-invalid');
      if (ids.length) el.setAttribute('aria-describedby', ids.join(' ')); else el.removeAttribute('aria-describedby');
    });
    if (!errs.length) return;
    if (focusEl) { focusEl.focus(); if (focusEl.select) focusEl.select(); } else box.focus();
  }

  function clientOptions(selected, includeId) {
    const list = state.clients.filter(c => !c.archived || c.id === includeId);
    return list.map(c => `<option value="${esc(c.id)}"${c.id === selected ? ' selected' : ''}>${esc(C.clientLabel(state, c))}${c.subject && C.clientLabel(state, c) === c.name ? ' · ' + esc(c.subject) : ''}${c.archived ? ' (archived)' : ''}</option>`).join('');
  }

  /** Move the user to the 30-second quick-start form on the empty dashboard. */
  function focusQuickStart() {
    const q = document.getElementById('q-name');
    if (!q) { location.hash = 'students'; return; }
    q.focus({ preventScroll: true });
    if (q.scrollIntoView) q.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  function noStudents(title) {
    return `<h1 tabindex="-1">${title}</h1><div class="card empty"><h2>No students yet</h2><p>Add your first student, or load sample data to look around.</p>
      <div class="actions center"><a class="btn" href="#students" data-act="startOwn">Add a student</a><button class="btn ghost" data-act="demo">Load sample data</button></div></div>`;
  }

  /* ---------- views ---------- */
  const views = {
    dashboard() {
      const hello = state.profile.name ? 'Hi ' + esc(firstName(state.profile.name)) : 'Dashboard';
      if (!state.clients.length) {
        return `
          <h1 tabindex="-1">${hello}</h1>
          <p class="sub">Nothing logged yet. Try the sample data or add your first student.</p>
          <section class="card hero">
            <h2>Start here</h2>
            <p>Log a session in about 10 seconds, see who still owes you, send a parent a progress update, and export volunteer hours for your NHS sponsor. It's free, there's no account, and it works offline.</p>
            <div class="actions"><button class="btn" data-act="demo">Try it with sample data</button><button class="btn ghost" data-act="focusQuick">Start with my own students</button></div>
            <p class="mt-s"><a href="#about">How it works, who it's for, and pricing</a></p>
          </section>
          <form class="card quickstart" id="quickForm" novalidate aria-labelledby="qs-title">
            <h2 id="qs-title">Try it with your own student <span class="opt">(about 30 seconds)</span></h2>
            <p class="sub tight">Log one real session and TutorLoop writes the parent update, the invoice, and the payment reminder for you.</p>
            <div class="form-errors" tabindex="-1" role="alert"></div>
            <div class="row">
              <div><label for="q-name">Student name</label><input id="q-name" name="name" maxlength="80" autocomplete="off" placeholder="e.g. Maya Chen" required></div>
              <div><label for="q-rate">Rate ($/hr)</label><input id="q-rate" name="rate" type="number" inputmode="decimal" min="0" max="1000" step="0.01" value="25"></div>
              <div><label for="q-minutes">Minutes today</label><input id="q-minutes" name="minutes" type="number" inputmode="numeric" min="1" max="${C.MAX_MINUTES}" step="1" value="60" required>
                <div class="chips" role="group" aria-label="Quick durations">${[30, 45, 60, 90].map(m => `<button type="button" class="chip" data-act="setMinutes" data-target="q-minutes" data-min="${m}" >${m} min</button>`).join('')}</div></div>
            </div>
            <div class="row">
              <div><label for="q-topics">What did you work on?</label><input id="q-topics" name="topics" maxlength="300" placeholder="e.g. fractions, word problems"></div>
              <div><label for="q-notes">How did it go?</label><input id="q-notes" name="notes" maxlength="2000" placeholder="e.g. Improved on word problems, still rushes signs"></div>
            </div>
            <label class="check"><input type="checkbox" name="volunteer"> Volunteer session (service hours, no charge)</label>
            <div class="actions"><button class="btn" type="submit">Save and see what TutorLoop makes</button></div>
          </form>
          <section class="card steps">
            <h2>Or set up step by step</h2>
            <ol>
              <li class="${state.profile.name ? 'done' : ''}"><a href="#settings">Add your name and payment handle</a><span class="sub-inline">so they show on invoices and updates</span></li>
              <li><a href="#students">Add a student</a><span class="sub-inline">name, subject, rate, parent email</span></li>
              <li><a href="#log">Log your first session</a><span class="sub-inline">topics and notes power parent updates</span></li>
            </ol>
          </section>`;
      }
      const m = thisMonth();
      const s = C.stats(state, m);
      const sp = C.serviceProgress(state);
      const bal = C.balances(state).filter(b => b.owed > 0);
      const recent = state.sessions.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
      const series = C.monthlySeries(state, m, 6);
      const hasEarnings = series.some(d => d.earned > 0);
      const firstRun = state.sessions.length === 1 && state.clients.length === 1 ? state.sessions[0] : null;
      const fc = firstRun && C.clientById(state, firstRun.clientId);
      const callout = fc ? `<section class="card firstrun" aria-labelledby="fr-title"><h2 id="fr-title" tabindex="-1">Your first session is logged. Here's what TutorLoop made from it</h2>
          <div class="grid two">
            <div><h3 class="h-s">Parent update (draft)</h3><pre class="excerpt">${esc(C.progressReport(state, fc.id, '', '').split('\n').slice(0, 7).join('\n'))}</pre>
              <div class="actions"><a class="btn small" href="#reports">Open the full update</a></div></div>
            <div><h3 class="h-s">Next, in one click each</h3><ul class="plain-list">
              ${firstRun.volunteer ? `<li><a href="#hours">Service-hour log</a>: ${C.cents(firstRun.minutes / 60)} hours ready to print for your sponsor</li>`
                : `<li><a href="#invoices/${esc(fc.id)}">Invoice</a> for ${C.money(C.sessionAmount(firstRun, fc))}, ready to print or save as PDF</li>`}
              <li><a href="#students/${esc(fc.id)}">Add a parent email</a> so updates and reminders open addressed${fc.parentEmail ? ' (done)' : ''}</li>
              <li><a href="#settings">Add your name and payment handle</a> so they appear on everything${state.profile.name ? ' (done)' : ''}</li>
              <li><a href="#summary">Monthly summary</a> to print or send at the end of the month</li>
              <li class="muted">All of this is free for up to ${C.FREE_CLIENT_LIMIT} students, with no account. <a href="#about">How TutorLoop makes money</a></li></ul></div>
          </div></section>` : '';
      return `
        <h1 tabindex="-1">${hello}</h1>
        <p class="sub">Your tutoring business at a glance for ${esc(C.fmtMonth(m))}. <a href="#summary/${esc(m)}">Monthly summary</a></p>
        ${callout}
        <div class="grid kpis">
          <div class="card kpi"><div class="label">Earned this month</div><div class="value">${C.money(s.earned)}</div><div class="hint">${C.plural(s.paidHours, 'paid hour')}${s.effectiveRate ? ' · ' + C.money(s.effectiveRate) + '/hr' : ''}</div></div>
          <div class="card kpi"><div class="label">Collected this month</div><div class="value good">${C.money(s.collected)}</div><div class="hint">${C.plural(s.sessions, 'session')} this month</div></div>
          <div class="card kpi"><div class="label">Unpaid (all time)</div><div class="value ${s.unpaidAll > 0 ? 'warn' : ''}">${C.money(s.unpaidAll)}</div><div class="hint">${bal.length ? C.plural(bal.length, 'family', 'families') + (bal.length === 1 ? ' owes you' : ' owe you') : 'all caught up'}</div></div>
          <div class="card kpi"><div class="label">Service hours</div><div class="value brand">${sp.hours}</div><div class="hint">${sp.goal ? sp.pct + '% of your ' + sp.goal + '-hour goal' : 'volunteer tutoring logged'}</div></div>
        </div>
        <div class="grid two mt">
          <section class="card"><h2>Earnings, last 6 months</h2>
            ${hasEarnings ? `<canvas id="chart" role="img" aria-label="Bar chart of earnings: ${esc(series.map(d => C.fmtMonth(d.month, 'short') + ' ' + C.money(d.earned)).join(', '))}"></canvas>`
              : '<p class="sub">Your earnings trend appears here after you log paid sessions.</p>'}
          </section>
          <section class="card"><h2>Who owes you</h2>
            ${bal.length ? `<table class="stack"><thead><tr><th scope="col">Student</th><th scope="col" class="num">Owed</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>
              ${bal.map(b => `<tr><td data-label="Student" class="who"><div><b>${esc(b.client.name)}</b>${b.client.archived ? ' <span class="pill">archived</span>' : ''}<div class="muted small">${C.plural(b.unpaidSessions, 'unpaid session')} since ${esc(fd(b.oldestUnpaid))}</div></div></td>
              <td data-label="Owed" class="num warn"><b>${C.money(b.owed)}</b>${b.partPaid > 0 ? `<div class="muted small part-paid">${C.money(b.partPaid)} of ${C.money(b.unpaidBilled)} paid</div>` : ''}</td>
              <td class="num row-actions"><a class="btn small ghost" href="#invoices/${esc(b.client.id)}">Invoice</a>
                <a class="btn small ghost" href="${esc(mailto(b.client.parentEmail, 'Tutoring balance for ' + b.client.name, C.reminderMessage(state, b.client.id)))}">Remind</a>
                <button class="btn small" data-act="markPaidAll" data-id="${esc(b.client.id)}">Mark paid</button></td></tr>`).join('')}
            </tbody></table>` : '<p class="sub">Nobody owes you money. Nice.</p>'}
          </section>
        </div>
        ${activeClients().length ? `<section class="card mt"><h2>Quick log</h2><p class="sub tight">Start from your last session with a student.</p><div class="actions">
          ${activeClients().map(c => `<a class="btn ghost small" href="#log/for/${esc(c.id)}">+ ${esc(firstName(c.name))}</a>`).join('')}</div></section>` : ''}
        <section class="card mt"><h2>Recent sessions</h2>
          ${recent.length ? sessionTable(recent) : '<p class="sub">No sessions logged yet. <a href="#log">Log your first one</a>.</p>'}
        </section>`;
    },

    log(params) {
      if (!activeClients().length && !params[0]) return noStudents('Log a session');
      const editing = params[0] && params[0] !== 'for' ? state.sessions.find(s => s.id === params[0]) : null;
      if (params[0] && params[0] !== 'for' && !editing) return `<h1 tabindex="-1">Session not found</h1><div class="card empty"><p>This session may have been deleted.</p><a class="btn" href="#log">Log a new session</a></div>`;
      let s;
      if (editing) s = editing;
      else {
        const pick = (params[0] === 'for' && C.clientById(state, params[1])) || activeClients()[0];
        if (!pick) return noStudents('Log a session');
        const last = C.lastSession(state, pick.id);
        s = { clientId: pick.id, date: today(), minutes: last ? last.minutes : 60, rate: last ? last.rate : null, topics: '', notes: '', paid: false,
          volunteer: last ? !!last.volunteer : !!pick.volunteerDefault, lastTopics: last ? last.topics : '' };
      }
      const chip = m => `<button type="button" class="chip" data-act="setMinutes" data-min="${m}" >${m} min</button>`;
      return `
        <h1 tabindex="-1">${editing ? 'Edit session' : 'Log a session'}</h1>
        <p class="sub">Takes about 10 seconds. Topics and notes power your parent updates.</p>
        <form class="card" id="sessionForm" data-id="${editing ? esc(editing.id) : ''}" novalidate>
          <div class="form-errors" tabindex="-1" role="alert"></div>
          <div class="row">
            <div class="wide-m"><label for="f-client">Student</label><select id="f-client" name="clientId">${clientOptions(s.clientId, s.clientId)}</select></div>
            <div><label for="f-date">Date</label><input id="f-date" name="date" type="date" value="${esc(s.date)}" min="2000-01-01" max="${C.addDays(today(), 1)}" required></div>
            <div><label for="f-minutes">Minutes</label><input id="f-minutes" name="minutes" type="number" inputmode="numeric" min="1" max="${C.MAX_MINUTES}" step="1" value="${esc(s.minutes)}" required>
              <div class="chips" role="group" aria-label="Quick durations">${[30, 45, 60, 90].map(chip).join('')}</div></div>
            <div><label for="f-rate">Rate override ($/hr)</label><input id="f-rate" name="rate" type="number" inputmode="decimal" min="0" step="0.01" placeholder="Student's rate" value="${esc(s.rate == null ? '' : s.rate)}"></div>
          </div>
          <div class="row one">
            <div><label for="f-topics">Topics covered <span class="opt">(comma separated)</span></label><input id="f-topics" name="topics" maxlength="300" placeholder="${esc(s.lastTopics ? 'Last time: ' + s.lastTopics : 'e.g. systems of equations, word problems')}" value="${esc(s.topics)}"></div>
          </div>
          <div class="row one">
            <div><label for="f-notes">How did it go?</label><textarea id="f-notes" name="notes" maxlength="2000" aria-describedby="notes-help" placeholder="e.g. Improved on word problems, still careless with signs">${esc(s.notes)}</textarea>
              <p class="help" id="notes-help">Write it the way you'd say it to a parent. Your latest win or focus area can be quoted in parent updates, and you can edit every update before sending.</p></div>
          </div>
          <div class="row checks">
            <label class="check"><input type="checkbox" name="volunteer" id="f-vol" ${s.volunteer ? 'checked' : ''}> Volunteer session (service hours, $0)</label>
            <label class="check"><input type="checkbox" name="paid" id="f-paid" ${s.paid ? 'checked' : ''} ${s.volunteer ? 'disabled' : ''}> Already paid</label>
          </div>
          <p class="preview" id="amountPreview" aria-live="polite"></p>
          <div class="actions"><button class="btn" type="submit">${editing ? 'Save changes' : 'Save session'}</button>
          ${editing ? `<a class="btn ghost" href="#dashboard">Cancel</a><button class="btn danger" type="button" data-act="deleteSession" data-id="${esc(editing.id)}">Delete</button>` : ''}</div>
        </form>`;
    },

    students(params) {
      const editing = params[0] ? C.clientById(state, params[0]) : null;
      const c = editing || { name: '', subject: '', grade: '', rate: 25, parentName: '', parentEmail: '', volunteerDefault: false };
      const bal = C.balances(state);
      const active = bal.filter(b => !b.client.archived), archived = bal.filter(b => b.client.archived);
      const plan = state.profile.plan;
      const atLimit = plan === 'free' && activeClients().length >= C.FREE_CLIENT_LIMIT && !editing;
      return `
        <h1 tabindex="-1">Students</h1>
        ${C.duplicateNames(state).length ? `<p class="notice" id="dupNote" role="status">${esc(C.duplicateNamesWarning(state))}</p>` : ''}
        <p class="sub">${plan === 'free' ? `Free plan: ${activeClients().length} of ${C.FREE_CLIENT_LIMIT} active students.` : (plan === 'club' ? 'Club plan' : 'Pro plan') + ': unlimited students.'}</p>
        <div class="grid two">
          <form class="card" id="clientForm" data-id="${editing ? esc(editing.id) : ''}" novalidate>
            <h2>${editing ? 'Edit ' + esc(editing.name) : 'Add a student'}</h2>
            ${atLimit ? `<p class="notice" id="limitNote"><b>The Free plan holds ${C.FREE_CLIENT_LIMIT} active students, so adding is paused.</b> Archive a student you no longer tutor (Edit, then Archive) to free a spot, or <a href="#settings">see plans</a> for unlimited students.</p>` : ''}
            <div class="form-errors" tabindex="-1" role="alert"></div>
            <fieldset class="bare"${atLimit ? ' disabled aria-describedby="limitNote"' : ''}>
            <div class="row"><div><label for="c-name">Student name</label><input id="c-name" name="name" maxlength="80" autocomplete="off" value="${esc(c.name)}" required></div>
              <div><label for="c-grade">Grade <span class="opt">(optional)</span></label><input id="c-grade" name="grade" maxlength="20" value="${esc(c.grade)}"></div></div>
            <div class="row"><div><label for="c-subject">Subject</label><input id="c-subject" name="subject" maxlength="80" placeholder="Algebra 1" value="${esc(c.subject)}"></div>
              <div><label for="c-rate">Rate ($/hr)</label><input id="c-rate" name="rate" type="number" inputmode="decimal" min="0" max="1000" step="0.01" value="${esc(c.rate)}"></div></div>
            <div class="row"><div><label for="c-pname">Parent name</label><input id="c-pname" name="parentName" maxlength="80" placeholder="Mrs. Chen" value="${esc(c.parentName)}"></div>
              <div><label for="c-pemail">Parent email</label><input id="c-pemail" name="parentEmail" type="email" maxlength="120" value="${esc(c.parentEmail)}"></div></div>
            <label class="check"><input type="checkbox" name="volunteerDefault" ${c.volunteerDefault ? 'checked' : ''}> Volunteer student (sessions default to service hours)</label>
            <div class="actions"><button class="btn" type="submit">${editing ? 'Save' : 'Add student'}</button>
              ${editing ? `<a class="btn ghost" href="#students">Cancel</a>${editing.archived ? '' : `<button type="button" class="btn danger" data-act="archiveClient" data-id="${esc(editing.id)}">Archive</button>`}` : ''}</div>
            </fieldset>
          </form>
          <section class="card"><h2>Roster</h2>
            ${active.length ? `<table class="stack"><thead><tr><th scope="col">Student</th><th scope="col" class="num">Rate</th><th scope="col" class="num">Owed</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>
            ${active.map(b => `<tr><td data-label="Student" class="who"><div><b>${esc(b.client.name)}</b>${b.client.volunteerDefault ? ' <span class="pill vol">volunteer</span>' : ''}<div class="muted small">${esc(b.client.subject || '')}${b.client.grade ? ' · grade ' + esc(b.client.grade) : ''}</div></div></td>
              <td data-label="Rate" class="num">${C.money(b.client.rate)}</td><td data-label="Owed" class="num">${C.money(b.owed)}</td>
              <td class="num row-actions"><a class="btn small ghost" href="#students/${esc(b.client.id)}" aria-label="Edit ${esc(b.client.name)}">Edit</a></td></tr>`).join('')}
            </tbody></table>` : '<p class="sub">No active students yet.</p><button class="btn ghost" data-act="demo">Load sample data</button>'}
            ${archived.length ? `<details class="mt"><summary>Archived (${archived.length})</summary><ul class="plain">
              ${archived.map(b => `<li><span>${esc(b.client.name)}${b.owed ? ' · owes ' + C.money(b.owed) : ''}</span> <span class="row-actions"><button class="btn small ghost" data-act="restoreClient" data-id="${esc(b.client.id)}">Restore</button> <button class="btn small danger" data-act="deleteClient" data-id="${esc(b.client.id)}">Delete</button></span></li>`).join('')}</ul></details>` : ''}
          </section>
        </div>`;
    },

    reports() {
      if (!activeClients().length) return noStudents('Parent updates');
      const r = C.rangePreset('last30', today());
      return `
        <h1 tabindex="-1">Parent updates</h1>
        <p class="sub">TutorLoop turns your session notes into a parent-ready progress update. It runs entirely in your browser, so student notes never leave your device.</p>
        <div class="grid two">
          <form class="card" id="reportForm">
            <div class="row one"><div><label for="r-client">Student</label><select id="r-client" name="clientId">${clientOptions()}</select></div></div>
            <div class="row one"><div><label for="r-preset">Period</label><select id="r-preset" name="preset">
              <option value="last30">Last 30 days</option><option value="month">This month</option><option value="last90">Last 90 days</option><option value="all">All sessions</option><option value="custom">Custom dates</option></select></div></div>
            <div class="row"><div><label for="r-from">From</label><input id="r-from" type="date" name="from" value="${r.from}"></div><div><label for="r-to">To</label><input id="r-to" type="date" name="to" value="${r.to}"></div></div>
            <div class="actions"><button class="btn" type="submit">Generate update</button></div>
            <details class="mt"><summary>How it works</summary><p class="sub tight">Topics are counted and ranked. Each note is scored for progress words (improved, confident, mastered) and struggle words (confused, needs review), and simple negations like "not confident" are handled. The overall trend, your latest win, and the next focus area are pulled into a short summary. Nothing is sent to a server.</p></details>
          </form>
          <section class="card"><h2><label for="reportOut">Message <span class="opt">(edit before sending)</span></label></h2>
            <textarea class="report" id="reportOut" rows="16" spellcheck="true"></textarea>
            <div class="actions"><button class="btn ghost" type="button" data-act="copyReport">Copy</button><a class="btn ghost" id="mailReport" href="#reports">Open in email</a></div>
            <p class="help" id="mailHint"></p>
          </section>
        </div>`;
    },

    invoices(params) {
      if (!state.clients.length) return noStudents('Invoices');
      const requested = params[0] && C.clientById(state, params[0]);
      const id = requested ? requested.id : (C.balances(state).find(b => b.owed > 0) || { client: state.clients[0] }).client.id;
      const inv = C.invoice(state, id, today());
      const p = state.profile;
      const paysFor = cid => (state.payments || []).filter(x => x.clientId === cid).sort((a, b) => b.date.localeCompare(a.date));
      return `
        <div class="no-print"><h1 tabindex="-1">Invoices</h1><p class="sub">Unpaid sessions roll into one invoice. Print it or save it as a PDF.</p>
          ${params[0] && !requested ? '<p class="notice">That student was not found, so the invoice with the largest balance is shown.</p>' : ''}
          <div class="toolbar"><label for="invPick" class="sr-only">Student</label><select id="invPick">${state.clients.map(c => `<option value="${esc(c.id)}"${c.id === id ? ' selected' : ''}>${esc(C.clientLabel(state, c))}${c.archived ? ' (archived)' : ''}</option>`).join('')}</select>
          <button class="btn" data-act="print" ${inv.items.length ? '' : 'disabled'}>Print / Save PDF</button>
          ${inv.items.length ? `<a class="btn ghost" href="${esc(mailto(inv.client.parentEmail, 'Tutoring balance for ' + inv.client.name, C.reminderMessage(state, id)))}">Email reminder</a>
            <button class="btn ghost" data-act="markPaidAll" data-id="${esc(id)}">Mark all paid</button>` : ''}</div>
          ${inv.items.length ? `<form id="payForm" class="card pay-form" data-id="${esc(id)}" novalidate aria-labelledby="payTitle">
            <h2 id="payTitle" class="flush">Record a payment</h2>
            <p class="sub">Got part of the money? Enter it and it covers the oldest sessions first. Sessions it fully covers turn paid; the rest is kept as a part payment.</p>
            <div class="form-errors" id="pay-errors" tabindex="-1" role="alert"></div>
            <div class="row pay-row"><div><label for="pay-amount">Amount received ($)</label><input id="pay-amount" name="amount" aria-describedby="pay-errors" type="number" inputmode="decimal" step="0.01" min="0.01" max="${C.MAX_PAYMENT}" placeholder="e.g. 20.00" autocomplete="off"></div>
            <div><button class="btn" type="submit">Record payment</button></div></div>
            <p class="muted small">Balance now ${C.money(inv.total)}. Venmo, Zelle or cash: whatever they sent.</p></form>` : ''}
          ${paysFor(id).length ? `<details class="pay-history no-print"><summary>Payments recorded for ${esc(inv.client.name)} (${paysFor(id).length})</summary>
            <ul>${paysFor(id).map(x => `<li>${esc(C.fmtDate(x.date, true))}: <b>${C.money(x.amount)}</b></li>`).join('')}</ul></details>` : ''}</div>
        <article class="card invoice-doc" aria-label="Invoice preview">
          <div class="head"><div><h2 class="flush">${esc(p.business || p.name || 'Your tutoring business')}</h2><div class="muted">${esc(p.name && p.business ? p.name : '')}${p.email ? (p.name && p.business ? ' · ' : '') + esc(p.email) : ''}</div></div>
            <div class="right"><b>INVOICE</b><br>${esc(inv.number)}<br>${esc(C.fmtDate(today(), true))}</div></div>
          <p><b>Bill to:</b> ${esc(inv.client.parentName || 'Parent/guardian of ' + inv.client.name)}${inv.client.parentEmail ? ' · ' + esc(inv.client.parentEmail) : ''}<br>
            <b>Student:</b> ${esc(inv.client.name)}${inv.client.subject ? ' · ' + esc(inv.client.subject) : ''}</p>
          ${inv.items.length ? `<table><thead><tr><th scope="col">Date</th><th scope="col">Topics</th><th scope="col" class="num">Time</th><th scope="col" class="num">Amount</th></tr></thead><tbody>
            ${inv.items.map(i => `<tr><td>${esc(C.fmtDate(i.date, true))}</td><td>${esc(i.topics)}</td><td class="num">${i.minutes} min</td><td class="num">${i.partPaid ? `${C.money(i.amount)}<div class="muted small">${C.money(i.partPaid)} of ${C.money(i.full)} already paid</div>` : C.money(i.amount)}</td></tr>`).join('')}
            </tbody><tfoot><tr><td colspan="3" class="num"><b>Total due</b></td><td class="num"><b>${C.money(inv.total)}</b></td></tr></tfoot></table>
            ${p.venmo ? `<p>Pay with: <b>${esc(C.paymentText(p))}</b></p>` : '<p class="muted no-print">Tip: add your Venmo or Zelle handle in <a href="#settings">Settings</a> so it prints here.</p>'}` : (state.sessions.some(x => x.clientId === id) ? '<p class="sub">No unpaid sessions for this student.</p>'
              : `<p class="sub">No sessions logged for ${esc(firstName(inv.client.name))} yet, so there is nothing to bill.</p><p class="no-print"><a class="btn small" href="#log/for/${esc(id)}">Log a session for ${esc(firstName(inv.client.name))}</a></p>`)}
          <p class="muted">Thank you.</p>
          ${p.referralFooter ? `<p class="muted referral">Sent with TutorLoop, a free app for student tutors: <a href="${esc(C.APP_URL)}">${esc(C.APP_URL.replace(/^https:\/\//, ''))}</a></p>` : ''}
        </article>`;
    },

    summary(params) {
      if (!state.clients.length) return noStudents('Monthly summary');
      const months = C.summaryMonths(state, thisMonth());
      const month = /^\d{4}-\d{2}$/.test(params[0] || '') ? params[0] : thisMonth();
      if (!months.includes(month)) months.push(month), months.sort().reverse();
      const c = params[1] ? C.clientById(state, params[1]) : null;
      const sm = C.monthSummary(state, month, c ? c.id : '');
      const t = sm.totals, p = state.profile, label = C.fmtMonth(month);
      const text = C.summaryText(state, month, c ? c.id : '');
      const hrs = h => C.plural(h, 'hour');
      const kpi = (l, v, h, cls) => `<div class="card kpi"><div class="label">${l}</div><div class="value ${cls || ''}">${v}</div><div class="hint">${h}</div></div>`;
      return `
        <div class="no-print"><h1 tabindex="-1">Monthly summary</h1>
          <p class="sub">One page per month: send it to a family as a statement, hand it to your NHS or service-hour sponsor, or keep it for your own records.</p>
          ${params[1] && !c ? '<p class="notice">That student was not found, so the summary for all students is shown.</p>' : ''}
          <div class="toolbar">
            <label for="sumMonth" class="sr-only">Month</label><select id="sumMonth">${months.map(k => `<option value="${esc(k)}"${k === month ? ' selected' : ''}>${esc(C.fmtMonth(k))}</option>`).join('')}</select>
            <label for="sumWho" class="sr-only">Student</label><select id="sumWho"><option value="">All students</option>${state.clients.map(x => `<option value="${esc(x.id)}"${c && x.id === c.id ? ' selected' : ''}>${esc(C.clientLabel(state, x))} (family statement)</option>`).join('')}</select>
            <button class="btn" data-act="print">Print / Save PDF</button>
            <button class="btn ghost" data-act="copySummary">Copy as text</button>
            ${c ? `<a class="btn ghost" href="${esc(mailto(c.parentEmail, (c.name.split(' ')[0]) + "'s tutoring summary for " + label, text))}">Open in email</a>` : ''}
          </div></div>
        <article class="card summary-doc" aria-label="Monthly summary preview">
          <div class="head"><div><h2 class="flush">${c ? esc(c.name) + ': tutoring summary' : 'Tutoring summary'}</h2>
            <div class="muted">${esc(label)}${c && c.subject ? ' · ' + esc(c.subject) : ''}</div></div>
            <div class="right"><b>${esc(p.business || p.name || 'Your tutoring business')}</b>${p.business && p.name ? '<br>' + esc(p.name) : ''}${p.email ? '<br>' + esc(p.email) : ''}</div></div>
          ${t.sessions ? `
          <div class="grid kpis">
            ${kpi('Sessions', t.sessions, hrs(t.hours) + ' total')}
            ${t.paidSessions ? kpi('Charged', C.money(t.billed), hrs(t.paidHours) + ' of paid tutoring') : ''}
            ${t.paidSessions ? kpi('Unpaid', C.money(t.unpaid), C.money(t.paid) + ' marked paid', t.unpaid > 0 ? 'warn' : 'good') : ''}
            ${t.volunteerSessions || !c ? kpi('Service hours', t.volunteerHours, C.plural(t.volunteerSessions, 'volunteer session'), 'brand') : ''}
          </div>
          ${sm.topics.length ? `<p><b>Covered:</b> ${esc(sm.topics.slice(0, 10).join(', '))}</p>` : ''}
          ${c ? `<table><thead><tr><th scope="col">Date</th><th scope="col">Topics</th><th scope="col" class="num">Time</th><th scope="col" class="num">Amount</th><th scope="col">Status</th></tr></thead><tbody>
              ${sm.sessions.map(s => `<tr><td>${esc(fd(s.date))}</td><td>${esc(s.topics) || '<span class="muted">-</span>'}</td><td class="num">${esc(s.minutes)} min</td>
                <td class="num">${s.volunteer ? '<span class="muted">-</span>' : C.money(C.sessionAmount(s, c))}</td><td>${s.volunteer ? 'volunteer' : s.paid ? 'paid' : 'unpaid'}</td></tr>`).join('')}</tbody></table>
              ${t.paidSessions ? `<p>${sm.balanceAll > 0 ? `<b>Total balance due today: ${C.money(sm.balanceAll)}</b>${p.venmo ? ' · Pay with: ' + esc(C.paymentText(p)) : ''}` : 'Nothing is due. Thank you.'}</p>` : ''}`
            : `<table class="stack"><thead><tr><th scope="col">Student</th><th scope="col" class="num">Sessions</th><th scope="col" class="num">Hours</th><th scope="col" class="num">Charged</th><th scope="col" class="num">Unpaid</th><th scope="col" class="num">Service hrs</th></tr></thead><tbody>
              ${sm.students.map(r => `<tr><td data-label="Student"><a class="no-print-link" href="#summary/${esc(month)}/${esc(r.client.id)}">${esc(r.client.name)}</a></td><td data-label="Sessions" class="num">${r.sessions}</td><td data-label="Hours" class="num">${r.hours}</td>
                <td data-label="Charged" class="num">${r.paidSessions ? C.money(r.billed) : '-'}</td><td data-label="Unpaid" class="num">${r.paidSessions ? C.money(r.unpaid) : '-'}</td><td data-label="Service hrs" class="num">${r.volunteerHours || '-'}</td></tr>`).join('')}
              </tbody><tfoot><tr><td data-label="Student"><b>Total</b></td><td data-label="Sessions" class="num"><b>${t.sessions}</b></td><td data-label="Hours" class="num"><b>${t.hours}</b></td><td data-label="Charged" class="num"><b>${C.money(t.billed)}</b></td><td data-label="Unpaid" class="num"><b>${C.money(t.unpaid)}</b></td><td data-label="Service hrs" class="num"><b>${t.volunteerHours}</b></td></tr></tfoot></table>`}
          <p class="muted small">"Paid" and "unpaid" show each session's status as of ${esc(C.fmtDate(today(), true))}. Volunteer sessions are not charged.</p>
          ${!c && t.volunteerSessions ? '<div class="print-only sign"><p>Sponsor signature: ______________________________ Date: ____________</p></div>' : ''}`
          : `<p class="sub">No sessions ${c ? 'with ' + esc(c.name.split(' ')[0]) + ' ' : ''}in ${esc(label)} yet.</p>`}
          ${c && sm.payments.length ? `<section class="statement-payments" aria-labelledby="sumPayTitle"><h3 id="sumPayTitle" class="h-s">Payments received in ${esc(label)}</h3>
            <table><thead><tr><th scope="col">Date</th><th scope="col" class="num">Amount</th></tr></thead><tbody>
            ${sm.payments.map(x => `<tr><td>${esc(fd(x.date))}</td><td class="num">${C.money(x.amount)}</td></tr>`).join('')}</tbody>
            ${sm.payments.length > 1 ? `<tfoot><tr><td><b>Total received</b></td><td class="num"><b>${C.money(sm.paymentsTotal)}</b></td></tr></tfoot>` : ''}</table></section>` : ''}
          ${p.referralFooter ? `<p class="muted referral">Made with TutorLoop, a free app for student tutors: <a href="${esc(C.APP_URL)}">${esc(C.APP_URL.replace(/^https:\/\//, ''))}</a></p>` : ''}
        </article>
        <textarea id="summaryText" class="sr-only" tabindex="-1" aria-hidden="true" readonly>${esc(text)}</textarea>`;
    },

    hours() {
      const vol = state.sessions.filter(s => s.volunteer).sort((a, b) => b.date.localeCompare(a.date));
      const sp = C.serviceProgress(state);
      const p = state.profile;
      return `
        <div class="no-print"><h1 tabindex="-1">Service hours</h1>
        <p class="sub">Volunteer tutoring counts toward NHS, Beta Club, and other service-hour requirements. Export a clean log for your sponsor.</p></div>
        <div class="grid kpis no-print"><div class="card kpi"><div class="label">Total service hours</div><div class="value brand">${sp.hours}</div><div class="hint">${C.plural(vol.length, 'volunteer session')}</div></div>
          <div class="card kpi"><div class="label">Goal</div>${sp.goal ? `<div class="value">${sp.pct}%</div>
            <div class="bar" role="progressbar" aria-label="Service-hour goal progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${sp.pct}"><span class="w${Math.round(sp.pct / 5) * 5}"></span></div>
            <div class="hint">${sp.remaining ? sp.remaining + ' hours to go of ' + sp.goal : 'Goal reached.'}</div>` : '<div class="hint mt-s">No goal set. <a href="#settings">Set an hour goal</a> to track progress.</div>'}</div></div>
        <section class="card mt hours-doc">
          <div class="print-only"><h2>Volunteer tutoring log</h2><p>Volunteer: ${esc(p.name || '________________')} · Total: ${sp.hours} hours · Printed ${esc(C.fmtDate(today(), true))}</p></div>
          <div class="toolbar no-print"><button class="btn" data-act="exportHours" ${vol.length ? '' : 'disabled'}>Export hours (CSV)</button><button class="btn ghost" data-act="print" ${vol.length ? '' : 'disabled'}>Print log for sponsor</button><a class="btn ghost" href="#summary">Monthly summary</a></div>
          ${vol.length ? sessionTable(vol, true) : '<p class="sub">No volunteer sessions yet. Tick "Volunteer session" when you log one.</p>'}
          <div class="print-only sign"><p>Sponsor signature: ______________________________ Date: ____________</p></div>
        </section>`;
    },

    about() {
      // Competitor list prices, copied from the vendors' own pricing pages (monthly billing, USD) on CMP.checked.
      const CMP = { checked: 'Oct 10, 2026', checkedMarket: 'Oct 11, 2026', checkedCost: 'Oct 11, 2026', lessons: 8,
        syncMonthly: 5,                                   // https://developers.cloudflare.com/workers/platform/pricing/ (Workers Paid: $5/mo minimum, includes D1 + KV)
        tutorbird: { base: 16.95, perTutor: 4.95 },      // https://www.tutorbird.com/pricing/
        teachworks: { base: 16.49, perLesson: 0.32 } };  // https://teachworks.com/pricing (Starter: $16.49/mo + $0.320 per student lesson)
      // Founder pitch / landing page. Every number here is either a list price, a published fee,
      // or arithmetic on those. There is no traction to report yet, and the page says so.
      const fee = price => Math.round((price * 0.029 + 0.30 + price * 0.007) * 100) / 100;   // Stripe card 2.9% + 30c, Billing 0.7%
      const row = (name, price, per) => { const f = fee(price); return `<tr><td data-label="Plan">${name}</td><td data-label="Price" class="num">${C.money(price)}${per}</td>
        <td data-label="Card + billing fees" class="num">${C.money(f)}</td><td data-label="TutorLoop keeps" class="num"><span><b>${C.money(price - f)}</b> (${Math.round((price - f) / price * 100)}%)</span></td></tr>`; };
      return `
        <h1 tabindex="-1">Why TutorLoop</h1>
        <p class="sub">The back office for student tutors: log it, get paid, keep parents in the loop, prove your hours.</p>
        <section class="card hero">
          <h2>Why I built this</h2>
          <p>Student tutors often keep sessions in a notes app, scroll a Venmo feed to guess who paid, text each parent separately, and track volunteer hours on paper. TutorLoop puts those four jobs in one free app that runs in the browser, with no account and no server.</p>
          <div class="actions"><button class="btn" data-act="demo">Try it with sample data</button><a class="btn ghost" href="#students" data-act="startOwn">Start with my own students</a></div>
        </section>

        <h2 class="mt-l">The problem</h2>
        <div class="grid problems">
          <div class="card"><h3>Money slips</h3><p class="sub">After a few weeks it's hard to remember which sessions were paid, and asking a parent for money feels awkward.</p></div>
          <div class="card"><h3>Parents want updates</h3><p class="sub">Families paying for tutoring want to know what was covered and whether it's working. Writing that each week takes time.</p></div>
          <div class="card"><h3>Hours need proof</h3><p class="sub">Volunteer tutoring often counts toward NHS or other service-hour requirements, which need a log a sponsor can sign.</p></div>
        </div>

        <h2 class="mt-l">How it works</h2>
        <section class="card steps"><ol>
          <li><a href="#log">Log a session</a><span class="sub-inline">student, minutes, topics, a quick note; about 10 seconds</span></li>
          <li><a href="#invoices">Get paid</a><span class="sub-inline">see who owes you, print an invoice, send a polite reminder</span></li>
          <li><a href="#reports">Update parents</a><span class="sub-inline">a progress note written from your own session notes, on your device</span></li>
          <li><a href="#hours">Prove your hours</a><span class="sub-inline">volunteer sessions tracked toward a goal, exported as CSV or a signable log</span></li>
        </ol></section>

        <div class="grid two mt-l">
          <section class="card"><h2>Who it's for</h2>
            <ul><li><b>Students who tutor</b> privately or as volunteers, in high school or college.</li>
              <li><b>NHS chapters and peer-tutoring clubs</b> whose sponsors collect service-hour logs (the Club plan).</li></ul></section>
          <section class="card"><h2>Private by design</h2>
            <p class="sub">Everything stays in this browser: no sign-up, no tracking, nothing sent to a server. That matters because tutors handle information about minors. Backups are a file you download.</p></section>
        </div>

        <h2 class="mt-l">Business model</h2>
        <p class="sub">Freemium. The free plan is complete for a tutor with up to ${C.FREE_CLIENT_LIMIT} students. People pay when tutoring becomes a real side business, or when a club needs every tutor's hours in one place.</p>
        <section class="card">
          <table class="stack"><thead><tr><th scope="col">Plan</th><th scope="col" class="num">Price</th><th scope="col" class="num">Card + billing fees</th><th scope="col" class="num">TutorLoop keeps</th></tr></thead><tbody>
            <tr><td data-label="Plan">Free</td><td data-label="Price" class="num">$0</td><td data-label="Card + billing fees" class="num">-</td><td data-label="TutorLoop keeps" class="num">-</td></tr>
            ${row('Pro', 4, '/mo')}
            ${row('Pro (annual)', 36, '/yr')}
            ${row('Club', 99, '/school yr')}
          </tbody></table>
          <p class="sub mt-s">Fees use Stripe's published US rates: 2.9% + 30¢ per card payment plus 0.7% for subscription billing. The flat 30¢ hurts small monthly charges: fees take ${Math.round(fee(4) / 4 * 100)}% of a $4 month but ${Math.round(fee(36) / 36 * 100)}% of a $36 year, so annual Pro is the first pricing test. It is not on sale yet.</p>
          <p class="sub"><b>Who pays:</b> Free is for a tutor with up to ${C.FREE_CLIENT_LIMIT} students and costs them nothing; Pro is paid by a tutor whose side business has outgrown that; Club is paid by a school club or NHS chapter for all its tutors.</p>
          <p class="sub">Costs today: hosting is free (static files on GitHub Pages) and there is no server. Pro's sync and scheduled reminders are roadmap features; we won't charge for them until they exist.</p>
          <div class="actions"><a class="btn ghost" href="#settings">See the plans</a></div>
        </section>

        <h2 class="mt-l" id="market">Who pays, and how we reach them</h2>
        <p class="sub">The paying customer we can reach first isn't the individual tutor. It's the adult who has to collect every tutor's hours.</p>
        <div class="grid two">
          <section class="card"><h3>The channel: NHS chapters</h3>
            <ul><li>The National Honor Society has <b>17,000+ chapters</b> serving more than <b>1.4 million</b> students.</li>
              <li>The average chapter contributes about <b>1,000 hours</b> of service a year, and membership is based on four pillars, one of which is service. Someone has to collect and check those hours.</li>
              <li>One Club plan is meant to cover up to 50 tutors, so one adviser saying yes brings a whole chapter (once the sponsor dashboard exists; today TutorLoop is single-tutor).</li></ul>
            <p class="sub small">Sources: <a href="https://www.nationalhonorsociety.org/about/" target="_blank" rel="noopener">NHS: About</a> and <a href="https://en.wikipedia.org/wiki/National_Honor_Society" target="_blank" rel="noopener">Wikipedia</a> (citing NHS's own history page). Checked ${CMP.checkedMarket}.</p></section>
          <section class="card"><h3>The math, honestly</h3>
            <ul><li><b>Ceiling, not a forecast:</b> if every chapter paid for Club, that's 17,000 × ${C.money(99 - fee(99))} kept ≈ <b>$${(17000 * (99 - fee(99)) / 1e6).toFixed(1)} million</b> a year.</li>
              <li><b>Costs today: $0 a month.</b> Free static hosting and no server, so each free tutor costs us about nothing to serve.</li>
              <li><b>First real cost</b> is a sync server for Pro. We only build it once paying users ask for it, so revenue arrives before that cost does.</li></ul></section>
        </div>
        ${(() => {
          // Break-even for the first real cost, using the fee() math above. Ceilings are rounded UP: you can't have 1.4 customers.
          const proM = 4 - fee(4), proY = 36 - fee(36), club = 99 - fee(99), yearCost = CMP.syncMonthly * 12;
          return `<section class="card mt-s" id="breakeven"><h3>Break-even, in customers</h3>
          <p class="sub">The first bill arrives with sync. We'd run it on Cloudflare Workers Paid: <b>${C.money(CMP.syncMonthly)} a month</b> minimum, which includes a database and 10 million requests a month (<a href="https://developers.cloudflare.com/workers/platform/pricing/" target="_blank" rel="noopener">Cloudflare pricing</a>, checked ${CMP.checkedCost}). What it takes to cover that, after card and billing fees:</p>
          <table class="stack"><thead><tr><th scope="col">Paid by</th><th scope="col" class="num">TutorLoop keeps</th><th scope="col" class="num">Needed to cover sync</th></tr></thead><tbody>
            <tr><td data-label="Paid by">Pro, monthly</td><td data-label="TutorLoop keeps" class="num">${C.money(proM)}/mo</td><td data-label="Needed to cover sync" class="num"><b>${C.plural(Math.ceil(CMP.syncMonthly / proM), 'tutor')}</b></td></tr>
            <tr><td data-label="Paid by">Pro, annual</td><td data-label="TutorLoop keeps" class="num">${C.money(proY)}/yr</td><td data-label="Needed to cover sync" class="num"><b>${C.plural(Math.ceil(yearCost / proY), 'tutor')}</b></td></tr>
            <tr><td data-label="Paid by">Club</td><td data-label="TutorLoop keeps" class="num">${C.money(club)}/school yr</td><td data-label="Needed to cover sync" class="num"><span><b>1 chapter</b> covers ${Math.floor(club / CMP.syncMonthly)} months</span></td></tr>
          </tbody></table>
          <p class="sub mt-s">So sustainability doesn't need scale: a couple of paying tutors or one chapter covers the server, and every customer after that is margin. Not counted: our own time, and Cloudflare usage above the included amounts.</p></section>`;
        })()}
        <section class="card mt-s"><h3>Go-to-market, in order</h3>
          <ol><li><b>Seed:</b> NHS and math-club tutors at our own school and nearby Fort Bend ISD schools; demo at a chapter meeting.</li>
            <li><b>Start with one sponsor:</b> one NHS adviser gets a free semester of Club in exchange for feedback. Their pain (collecting and checking hours) is what drives a chapter-wide rollout.</li>
            <li><b>Word of mouth:</b> tutors can switch on an opt-in "Sent with TutorLoop" line, so every parent update and invoice carries a link (no tracking).</li>
            <li><b>Annual Pro test:</b> card and billing fees take ${Math.round(fee(4) / 4 * 100)}% of a $4 monthly charge (mostly the flat 30¢), so an annual Pro price is the first pricing experiment.</li></ol></section>

        <h2 class="mt-l" id="compare">How it compares</h2>
        <p class="sub">Tutoring software exists, but it is priced for tutoring businesses. Here is what a student with a few families would pay, using each company's own published monthly price.</p>
        <section class="card">
          <table class="stack compare"><thead><tr><th scope="col">Tool</th><th scope="col">List price (monthly billing)</th><th scope="col" class="num">Example month*</th></tr></thead><tbody>
            <tr><td data-label="Tool"><b>TutorLoop Free</b></td><td data-label="List price">$0, up to ${C.FREE_CLIENT_LIMIT} active students</td><td data-label="Example month*" class="num"><b>$0.00</b></td></tr>
            <tr><td data-label="Tool">TutorBird</td><td data-label="List price">${C.money(CMP.tutorbird.base)}/mo + ${C.money(CMP.tutorbird.perTutor)} per additional tutor or staff member</td><td data-label="Example month*" class="num">${C.money(CMP.tutorbird.base)}</td></tr>
            <tr><td data-label="Tool">Teachworks Starter</td><td data-label="List price">${C.money(CMP.teachworks.base)}/mo + ${C.money(CMP.teachworks.perLesson)} per student lesson</td><td data-label="Example month*" class="num">${C.money(C.cents(CMP.teachworks.base + CMP.teachworks.perLesson * CMP.lessons))}</td></tr>
          </tbody></table>
          <p class="sub mt-s">*One tutor teaching ${CMP.lessons} one-on-one lessons a month (two students, once a week each). Teachworks: ${C.money(CMP.teachworks.base)} + ${CMP.lessons} × ${C.money(CMP.teachworks.perLesson)}. Both offer free trials (TutorBird 30 days, Teachworks 21 days).</p>
          <p class="sub"><b>To be fair:</b> both are full business platforms that do far more than TutorLoop, including lesson scheduling and billing, and TutorBird adds online payments and a student portal. TutorLoop does not take payments or schedule lessons. It's for a high schooler with a few students who wants the money, parent updates, and service hours sorted for free.</p>
          <p class="sub">Sources, checked ${CMP.checked}: <a href="https://www.tutorbird.com/pricing/" target="_blank" rel="noopener">TutorBird pricing</a> · <a href="https://teachworks.com/pricing" target="_blank" rel="noopener">Teachworks pricing</a>. Prices can change; see their pages for current terms.</p>
        </section>

        <div class="grid two mt-l">
          <section class="card"><h2>Where we are today</h2>
            <ul><li>A working prototype, built in October 2026 for the Next Founders Hackathon.</li>
              <li><b>No paying customers yet</b>, and no usage numbers to claim. Checkout in the app is a simulation.</li>
              <li>Free features work today, offline after your first visit.</li></ul></section>
          <section class="card"><h2>What's next</h2>
            <ol><li>Put it in front of student tutors and ask what they'd pay for.</li>
              <li>Pilot the Club plan with one NHS or peer-tutoring sponsor.</li>
              <li>Build sync before turning on real Pro billing.</li></ol></section>
        </div>`;
    },

    settings() {
      const p = state.profile;
      const plan = (id, name, price, per, feats, cta) => `<div class="card plan${p.plan === id ? ' current' : ''}"><h3>${name}</h3><div class="price">${price}<span class="per">${per}</span></div>
        <ul>${feats.map(f => '<li>' + f + '</li>').join('')}</ul>${p.plan === id ? '<span class="pill paid">Current plan</span>' : cta}</div>`;
      return `
        <h1 tabindex="-1">Settings &amp; plans</h1>
        <div class="grid two">
          <form class="card" id="profileForm" novalidate><h2>Your profile</h2>
            <div class="form-errors" tabindex="-1" role="alert"></div>
            <div class="row"><div><label for="p-name">Your name</label><input id="p-name" name="name" maxlength="80" autocomplete="name" value="${esc(p.name)}"></div><div><label for="p-business">Business name</label><input id="p-business" name="business" maxlength="100" value="${esc(p.business)}"></div></div>
            <div class="row"><div><label for="p-email">Email on invoices</label><input id="p-email" name="email" type="email" maxlength="120" autocomplete="email" value="${esc(p.email)}"></div><div><label for="p-goal">Service-hour goal <span class="opt">(optional)</span></label><input id="p-goal" name="serviceGoal" type="number" inputmode="decimal" min="0" max="1000" step="0.5" placeholder="e.g. 10" value="${esc(p.serviceGoal)}"></div></div>
            <div class="row"><div><label for="p-venmo">Payment handle</label><input id="p-venmo" name="venmo" maxlength="80" placeholder="@your-handle" aria-describedby="payPreview" value="${esc(p.venmo)}"></div>
              <div><label for="p-paymethod">Payment app <span class="opt">(optional)</span></label><input id="p-paymethod" name="payMethod" maxlength="30" list="payMethods" placeholder="Venmo, Zelle, PayPal…" aria-describedby="payPreview" value="${esc(p.payMethod || '')}">
                <datalist id="payMethods">${C.PAY_METHODS.map(m => `<option value="${esc(m)}"></option>`).join('')}</datalist></div></div>
            <p class="sub" id="payPreview" aria-live="polite">${esc(payPreviewText(p))}</p>
            <label class="check"><input type="checkbox" name="referralFooter" id="p-referral" aria-describedby="referralHelp" ${p.referralFooter ? 'checked' : ''}> Add a "Sent with TutorLoop" line to parent messages and invoices</label>
            <p class="sub" id="referralHelp">Off by default. It's one plain line with a link to TutorLoop. There's no tracking or referral code, and TutorLoop can't see who clicks it.</p>
            <div class="actions"><button class="btn" type="submit">Save profile</button></div></form>
          <section class="card"><h2>Your data</h2><p class="sub">Everything is stored only in this browser${storageOk ? '' : ' (saving is currently blocked)'}. Back it up, or move it to another device.</p>
            <div class="actions"><button class="btn ghost" data-act="exportJson">Download backup (JSON)</button>
              <button class="btn ghost" data-act="importClick">Restore backup</button><input type="file" id="importFile" accept="application/json,.json" hidden>
              <button class="btn ghost" data-act="exportSessions" ${state.sessions.length ? '' : 'disabled'}>Export sessions (CSV)</button>
              <button class="btn ghost" data-act="demo">Load sample data</button>
              <button class="btn danger" data-act="reset">Erase all data</button></div></section>
        </div>
        <h2 class="mt-l">Plans</h2>
        <p class="sub">Demo only: switching plans here simulates checkout, and no payment is taken.</p>
        ${(() => {
          const used = activeClients().length, lim = C.FREE_CLIENT_LIMIT, pv = C.proValue(state, 4);
          const pct = Math.min(100, Math.round(used / lim * 100));
          return `<section class="card usage" aria-labelledby="usage-title"><h3 id="usage-title">Your usage</h3>
            ${p.plan === 'free' ? `<p class="tight"><b>${used} of ${lim}</b> active students on Free${used >= lim ? '. You are at the limit: archive a student or try Pro.' : '.'}</p>
              <div class="bar" role="progressbar" aria-label="Free plan students used" aria-valuemin="0" aria-valuemax="${lim}" aria-valuenow="${used}"><span class="w${Math.round(pct / 5) * 5}"></span></div>`
              : `<p class="tight"><b>${used}</b> active students on ${p.plan === 'club' ? 'Club' : 'Pro'} (no limit).</p>`}
            <p class="sub mt-s">${pv ? `Pro is $4 a month, about <b>${C.plural(pv.minutes, 'minute')}</b> of tutoring at your average paid rate of ${C.money(pv.rate)}/hr.` : 'Once you log paid sessions, this shows what Pro costs in minutes of your own tutoring.'}
              Everything you use today stays free for up to ${lim} students; the only thing Pro adds today is more students. Sync and scheduled reminders are roadmap items and won't be charged for until they exist.</p></section>`;
        })()}
        <div class="grid plans">
          ${plan('free', 'Free', '$0', '', ['Up to 3 active students', 'Session log &amp; dashboard', 'Parent updates &amp; payment reminders', 'Invoices and service-hour export'], `<button class="btn ghost" data-act="plan" data-plan="free">Switch to Free</button>`)}
          ${plan('pro', 'Pro', '$4', '/month', ['Unlimited students', 'Everything in Free', 'Or $36 a year <span class="tag">not on sale yet</span>', 'Cloud sync across devices <span class="tag">roadmap</span>', 'Scheduled reminders <span class="tag">roadmap</span>'], `<button class="btn" data-act="plan" data-plan="pro">Try Pro (demo)</button>`)}
          ${plan('club', 'Club', '$99', '/school year', ['For NHS chapters &amp; peer-tutoring clubs', 'Unlimited students for the sponsor today', 'Up to 50 tutors <span class="tag">roadmap</span>', 'Sponsor dashboard <span class="tag">roadmap</span>', 'Verified service-hour reports <span class="tag">roadmap</span>'], `<button class="btn ghost" data-act="plan" data-plan="club">Try Club (demo)</button>`)}
        </div>`;
    }
  };

  function sessionTable(list, hoursMode) {
    return `<table class="stack sessions${hoursMode ? ' hours' : ''}"><thead><tr><th scope="col">Date</th><th scope="col">Student</th><th scope="col">Topics</th><th scope="col" class="num">Min</th>${hoursMode ? '<th scope="col" class="num">Hours</th>' : '<th scope="col" class="num">Amount</th><th scope="col">Status</th>'}<th scope="col" class="no-print"><span class="sr-only">Actions</span></th></tr></thead><tbody>
      ${list.map(s => { const c = C.clientById(state, s.clientId) || {}; return `<tr><td data-label="Date">${esc(fd(s.date))}</td><td data-label="Student">${esc(c.name || 'Unknown')}</td><td data-label="Topics">${esc(s.topics) || '<span class="muted">-</span>'}</td>
        <td data-label="Minutes" class="num">${esc(s.minutes)}</td>
        ${hoursMode ? `<td data-label="Hours" class="num">${C.cents(s.minutes / 60)}</td>` : `<td data-label="Amount" class="num">${s.volunteer ? '<span class="muted">-</span>' : C.money(C.sessionAmount(s, c)) + (!s.paid && Number(s.partPaid) > 0 ? `<div class="muted small">${C.money(s.partPaid)} paid, ${C.money(C.sessionDue(s, c))} left</div>` : '')}</td>
        <td data-label="Status">${s.volunteer ? '<span class="pill vol">volunteer</span>' : s.paid ? `<button class="pill paid" data-act="togglePaid" data-id="${esc(s.id)}" aria-label="Paid. Mark unpaid">paid</button>` : `<button class="pill unpaid" data-act="togglePaid" data-id="${esc(s.id)}" aria-label="Unpaid. Mark paid">unpaid</button>`}</td>`}
        <td class="num row-actions no-print"><a class="btn small ghost" href="#log/${esc(s.id)}" aria-label="Edit session on ${esc(fd(s.date))} with ${esc(c.name || 'student')}">Edit</a></td></tr>`; }).join('')}</tbody></table>`;
  }

  /* ---------- chart (vanilla canvas, no library) ---------- */
  function drawChart() {
    const cv = document.getElementById('chart'); if (!cv) return;
    const g = cv.getContext && cv.getContext('2d'); if (!g) return;
    const css = getComputedStyle(document.documentElement);
    const col = n => css.getPropertyValue(n).trim();
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 600, h = cv.clientHeight || 220;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const data = C.monthlySeries(state, thisMonth(), 6);
    const max = Math.max(50, ...data.map(d => d.earned));
    const pad = 12, bw = (w - pad * 2) / data.length;
    g.font = '12px system-ui, sans-serif'; g.textAlign = 'center';
    g.strokeStyle = col('--line'); g.beginPath(); g.moveTo(pad, h - 30.5); g.lineTo(w - pad, h - 30.5); g.stroke();
    data.forEach((d, i) => {
      const bh = Math.max(d.earned > 0 ? 3 : 0, (h - 64) * d.earned / max), x = pad + i * bw + bw * 0.2, y = h - 31 - bh;
      g.fillStyle = i === data.length - 1 ? col('--brand') : col('--brand-soft');
      g.beginPath(); if (g.roundRect) g.roundRect(x, y, bw * 0.6, bh, [6, 6, 0, 0]); else g.rect(x, y, bw * 0.6, bh); g.fill();
      if (d.earned > 0) { g.fillStyle = col('--ink'); g.fillText('$' + Math.round(d.earned).toLocaleString('en-US'), x + bw * 0.3, y - 6); }
      else { g.fillStyle = col('--muted'); g.fillText('$0', x + bw * 0.3, h - 37); }  // an empty month reads as "nothing earned", not as a missing bar
      g.fillStyle = col('--muted');
      g.fillText(C.fmtMonth(d.month, 'short'), x + bw * 0.3, h - 10);
    });
  }

  /* ---------- router ---------- */
  let lastRoute = null, refocusId = null;   // refocusId: keep focus on a picker that changed the route (arrow keys on a <select>)
  function parseHash() {
    const [route, ...params] = (location.hash.slice(1) || 'dashboard').split('/').map(p => { try { return decodeURIComponent(p); } catch (e) { return p; } });
    return { route: views[route] ? route : 'dashboard', params };
  }
  function render() {
    const { route, params } = parseHash();
    const key = route + '/' + params.join('/');
    const routeChanged = key !== lastRoute;
    // A same-page re-render (e.g. the hashchange that follows a save that already rendered the new page) replaces
    // the focused element; without this, keyboard focus fell to <body> (seen after restoring a backup).
    const ae = document.activeElement, hadFocus = !!ae && $app.contains(ae), prevFocusId = hadFocus && ae !== $app ? ae.id : '';
    $app.innerHTML = views[route](params);
    if (state.sample && route !== 'about') {
      // Without this, someone who tapped "Try it with sample data" had no obvious way back to a clean start (it was buried in Settings > Erase all data).
      $app.insertAdjacentHTML('afterbegin', `<div class="samplebar no-print" role="note"><p><b>You're exploring sample data.</b> Maya, Ethan, and Sofia are made-up students. Nothing here is real, and their parents' emails are example.com addresses, so Remind and Open in email open your mail app with a made-up recipient.</p>
        <button class="btn small" data-act="startFresh">Start fresh with my own students</button></div>`);
    }
    document.querySelectorAll('#nav a').forEach(a => {
      const on = a.getAttribute('href') === '#' + route;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.title = (route === 'dashboard' ? 'TutorLoop' : (document.querySelector('#app h1') || {}).textContent + ' · TutorLoop');
    if (route === 'dashboard') drawChart();
    if (route === 'log') updatePreview();
    if (route === 'reports') generateReport();
    if (routeChanged) {
      window.scrollTo(0, 0);
      const keep = refocusId && document.getElementById(refocusId); refocusId = null;
      if (keep) keep.focus({ preventScroll: true });
      else if (lastRoute !== null) { const h1 = document.querySelector('#app h1'); if (h1) h1.focus({ preventScroll: true }); }
      const act = document.querySelector('#nav a.active'); if (act && act.scrollIntoView && window.innerWidth < 720) act.scrollIntoView({ block: 'nearest', inline: 'center' });
    } else if (hadFocus && !$app.contains(document.activeElement)) {
      const el = (prevFocusId && document.getElementById(prevFocusId)) || document.querySelector('#app h1');
      if (el) el.focus({ preventScroll: true });
    }
    lastRoute = key;
  }
  window.addEventListener('hashchange', render);
  let resizeT; window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(drawChart, 120); });

  function updatePreview() {
    const f = document.getElementById('sessionForm'); const out = document.getElementById('amountPreview'); if (!f || !out) return;
    const d = formData(f); const c = C.clientById(state, d.clientId);
    const paid = f.querySelector('#f-paid'); if (paid) { paid.disabled = !!d.volunteer; if (d.volunteer) paid.checked = false; }
    const mins = Number(d.minutes);
    if (!mins || mins <= 0) { out.textContent = ''; return; }
    out.textContent = d.volunteer ? `Counts as ${C.cents(mins / 60)} service hours.` :
      `Amount: ${C.money(C.sessionAmount(d, c))} (${mins} min at ${C.money(d.rate !== '' && d.rate != null ? d.rate : c && c.rate)}/hr)`;
  }

  function generateReport() {
    const f = document.getElementById('reportForm'); if (!f) return;
    const d = formData(f);
    const c = C.clientById(state, d.clientId); if (!c) return;
    const text = C.progressReport(state, d.clientId, d.from, d.to);
    const ta = document.getElementById('reportOut');
    ta.value = text; autosize(ta);
    updateMailLink();
    document.getElementById('mailHint').textContent = c.parentEmail ? '' : 'No parent email saved for ' + firstName(c.name) + '. Add one on the Students page, or copy the message.';
  }
  function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 4, 900) + 'px'; }
  function updateMailLink() {
    const f = document.getElementById('reportForm'); const a = document.getElementById('mailReport'); if (!f || !a) return;
    const c = C.clientById(state, formData(f).clientId); if (!c) return;
    a.href = mailto(c.parentEmail, 'Tutoring update for ' + c.name, document.getElementById('reportOut').value);
  }

  /* ---------- events ---------- */
  document.addEventListener('input', e => {
    if (e.target.closest('#sessionForm')) updatePreview();
    if (e.target.id === 'p-venmo' || e.target.id === 'p-paymethod') {
      const out = document.getElementById('payPreview');
      if (out) out.textContent = payPreviewText({ venmo: document.getElementById('p-venmo').value, payMethod: document.getElementById('p-paymethod').value });
    }
    if (e.target.id === 'reportOut') { updateMailLink(); autosize(e.target); }
    if (e.target.id === 'r-from' || e.target.id === 'r-to') { const p = document.getElementById('r-preset'); if (p) p.value = 'custom'; }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'f-client' && !document.getElementById('sessionForm').dataset.id) {
      const c = C.clientById(state, t.value); const last = c && C.lastSession(state, c.id);
      const vol = document.getElementById('f-vol'); if (vol) vol.checked = last ? !!last.volunteer : !!(c && c.volunteerDefault);
      const top = document.getElementById('f-topics'); if (top) top.placeholder = last && last.topics ? 'Last time: ' + last.topics : 'e.g. systems of equations, word problems';
      updatePreview();
    }
    if (t.id === 'invPick') { refocusId = 'invPick'; location.hash = 'invoices/' + encodeURIComponent(t.value); }
    if (t.id === 'sumMonth' || t.id === 'sumWho') {
      refocusId = t.id;   // keep focus on the picker the arrow keys changed, not the heading
      const mo = document.getElementById('sumMonth').value, who = document.getElementById('sumWho').value;
      location.hash = 'summary/' + encodeURIComponent(mo) + (who ? '/' + encodeURIComponent(who) : '');
    }
    if (t.id === 'r-preset' && t.value !== 'custom') {
      const r = C.rangePreset(t.value, today());
      document.getElementById('r-from').value = r.from; document.getElementById('r-to').value = r.to; generateReport();
    }
    if (t.id === 'r-client') generateReport();
    if (t.id === 'importFile' && t.files[0]) {
      const file = t.files[0]; t.value = '';
      if (file.size > 5 * 1024 * 1024) { toast('That file is too large to be a TutorLoop backup.'); return; }
      file.text().then(txt => {
        const next = C.importState(txt);
        // Same rule as the Add-student form: two students with one name get mixed up on invoices. A backup
        // can predate that rule, so nothing is dropped or renamed; the tutor is told plainly, before and after.
        const dupWarn = C.duplicateNamesWarning(next);
        if ((state.clients.length || state.sessions.length) && !confirm(`Replace your current data with this backup (${C.plural(next.clients.length, 'student')}, ${C.plural(next.sessions.length, 'session')})?` + (dupWarn ? '\n\n' + dupWarn : ''))) return;
        if (dupWarn) location.hash = 'students';   // the Students page keeps the warning on screen after the toast goes
        commit(dupWarn ? 'Backup restored. ' + dupWarn : 'Backup restored', () => { state = next; });
      }).catch(err => toast(err.message));
    }
  });

  document.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target, d = formData(f);
    if (f.id === 'sessionForm') {
      d.minutes = d.minutes === '' ? NaN : Number(d.minutes); d.rate = d.rate === '' ? null : Number(d.rate);
      if (d.volunteer) d.paid = false;
      const errs = C.validateSession(d, today()); if (errs.length) return showErrors(f, errs);
      const existing = f.dataset.id && state.sessions.find(s => s.id === f.dataset.id);
      const rec = { clientId: d.clientId, date: d.date, minutes: d.minutes, rate: d.rate, topics: d.topics, notes: d.notes, paid: !!d.paid, volunteer: !!d.volunteer };
      location.hash = 'dashboard';
      // editSession keeps money already received: a part payment on a session made cheaper, volunteer, or moved to another student counts toward the family's other unpaid sessions.
      commit(r => withNote(existing ? 'Session updated' : 'Session saved', r), () => existing ? C.editSession(state, existing.id, rec) : C.addSession(state, rec));
    }
    if (f.id === 'payForm') {
      const plan = C.planPayment(state, f.dataset.id, d.amount);
      if (!plan.ok) { const a = document.getElementById('pay-amount'); if (a) a.setAttribute('aria-invalid', 'true'); return showErrors(f, [plan.error], a); }
      const who = firstName((C.clientById(state, f.dataset.id) || {}).name);
      commit(C.money(plan.amount) + ' recorded for ' + who + (plan.owedAfter > 0 ? '. ' + C.money(plan.owedAfter) + ' still owed.' : '. All paid up.'), () => { C.applyPayment(state, f.dataset.id, plan, today()); }, '#pay-amount');
      // Paid in full removes the form; don't drop keyboard focus on <body>.
      const field = document.getElementById('pay-amount') || document.querySelector('#app h1'); if (field) field.focus();
      return;
    }
    if (f.id === 'clientForm') {
      const existing = f.dataset.id && C.clientById(state, f.dataset.id);
      const rec = { name: d.name, subject: d.subject, grade: d.grade, rate: d.rate === '' ? '' : Number(d.rate), parentName: d.parentName, parentEmail: d.parentEmail, volunteerDefault: !!d.volunteerDefault };
      const errs = C.validateClient(existing ? Object.assign({}, rec, { id: existing.id }) : rec, state);
      if (errs.length) return showErrors(f, errs);
      location.hash = 'students';
      commit(r => withNote(existing ? 'Student updated' : 'Student added', r), () => { if (existing) { Object.assign(existing, rec); return C.settleCovered(state); } state.clients.push(Object.assign({ id: C.uid('c'), archived: false }, rec)); });
    }
    if (f.id === 'quickForm') {
      const client = { name: d.name, subject: '', grade: '', rate: d.rate === '' ? 0 : Number(d.rate), parentName: '', parentEmail: '', volunteerDefault: !!d.volunteer };
      const errs = C.validateClient(client, state);
      const sess = { clientId: 'pending', date: today(), minutes: Number(d.minutes), rate: null, topics: d.topics, notes: d.notes, paid: false, volunteer: !!d.volunteer };
      C.validateSession(sess, today()).forEach(e => { if (!errs.includes(e)) errs.push(e); });
      if (errs.length) return showErrors(f, errs);
      commit('First session saved', () => {
        const id = C.uid('c');
        state.clients.push(Object.assign({ id, archived: false }, client));
        state.sessions.push(Object.assign({}, sess, { id: C.uid('s'), clientId: id }));
      });
      const fr = document.getElementById('fr-title'); if (fr) fr.focus();
      return;
    }
    if (f.id === 'profileForm') {
      const errs = [];
      if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) errs.push('Email looks invalid.');
      if (d.serviceGoal !== '' && (isNaN(Number(d.serviceGoal)) || Number(d.serviceGoal) < 0 || Number(d.serviceGoal) > 1000)) errs.push('Service-hour goal must be between 0 and 1,000.');
      if (errs.length) return showErrors(f, errs);
      commit('Profile saved', () => { Object.assign(state.profile, { name: d.name, business: d.business, email: d.email, venmo: d.venmo, payMethod: d.payMethod, referralFooter: !!d.referralFooter, serviceGoal: Number(d.serviceGoal) > 0 ? Number(d.serviceGoal) : '' }); });
    }
    if (f.id === 'reportForm') { generateReport(); toast('Update generated'); }
  });

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
    const act = el.dataset.act, id = el.dataset.id;
    switch (act) {
      case 'demo':
        if ((state.sessions.length || state.clients.length) && !confirm('Replace your current data with sample data? You can undo right after.')) return;
        location.hash = 'dashboard';
        commit('Sample data loaded', () => { state = C.demoState(today()); });
        break;
      case 'startFresh':
        location.hash = 'dashboard';
        commit('Sample data cleared. Log your first real session below.', () => { state = C.emptyState(); });
        setTimeout(focusQuickStart, 60);   // after the hashchange re-render, so focus lands on the live form
        break;
      case 'focusQuick': focusQuickStart(); break;
      case 'startOwn':
        // With no students yet, the fastest start is the 30-second quick-start form on the dashboard; otherwise follow the link to #students.
        if (state.clients.length) break;
        e.preventDefault();
        if (parseHash().route === 'dashboard') focusQuickStart();
        else { location.hash = 'dashboard'; setTimeout(focusQuickStart, 60); }
        break;
      case 'setMinutes': { const m = document.getElementById(el.dataset.target || 'f-minutes'); if (m) m.value = el.dataset.min; updatePreview(); break; }
      // A session marked paid drops its part payment, the same as saving it as paid in the form and as a backup
      // restore does; otherwise the leftover came back (or didn't, after a reload) when it was marked unpaid again.
      case 'togglePaid': { const s = state.sessions.find(x => x.id === id); if (s) commit(r => withNote(s.paid ? 'Marked unpaid' : 'Marked paid', r), () => C.setPaid(state, s.id, !s.paid)); break; }
      case 'markPaidAll': { const c = C.clientById(state, id); commit('All of ' + firstName(c && c.name) + "'s sessions marked paid", () => { state.sessions.forEach(s => { if (s.clientId === id && !s.volunteer && !s.paid) C.setPaid(state, s.id, true); }); }); break; }
      case 'deleteSession': location.hash = 'dashboard'; commit(r => withNote('Session deleted', r), () => C.deleteSession(state, id)); break;
      case 'archiveClient': { const c = C.clientById(state, id); if (c) { location.hash = 'students'; commit(c.name + ' archived (history kept)', () => { c.archived = true; }); } break; }
      case 'restoreClient': {
        const c = C.clientById(state, id); if (!c) break;
        if (state.profile.plan === 'free' && activeClients().length >= C.FREE_CLIENT_LIMIT) { toast('The Free plan includes ' + C.FREE_CLIENT_LIMIT + ' active students. Archive one first.'); break; }
        commit(c.name + ' restored', () => { c.archived = false; }); break;
      }
      case 'deleteClient': {
        const c = C.clientById(state, id); if (!c) break;
        const n = state.sessions.filter(s => s.clientId === id).length;
        if (!confirm('Permanently delete ' + c.name + ' and ' + C.plural(n, 'session') + '? Use this when a family asks you to remove their data.')) break;
        commit(c.name + ' deleted', () => { C.deleteClient(state, id); });   // sessions and payments too
        break;
      }
      case 'copyReport': copyText(document.getElementById('reportOut').value).then(ok => toast(ok ? 'Copied to clipboard' : 'Copy failed. Select the text and copy it manually.')); break;
      case 'print': window.print(); break;
      case 'copySummary': copyText(document.getElementById('summaryText').value).then(ok => toast(ok ? 'Summary copied' : 'Copy failed. Use Print / Save PDF instead.')); break;
      case 'exportHours': download('service-hours-' + today() + '.csv', C.volunteerCSV(state), 'text/csv'); break;
      case 'exportSessions': download('tutorloop-sessions-' + today() + '.csv', C.sessionsCSV(state), 'text/csv'); break;
      case 'exportJson': download('tutorloop-backup-' + today() + '.json', JSON.stringify(state, null, 2), 'application/json'); break;
      case 'importClick': document.getElementById('importFile').click(); break;
      case 'plan': commit('Switched to ' + el.dataset.plan.charAt(0).toUpperCase() + el.dataset.plan.slice(1) + ' (demo, no charge)', () => { state.profile.plan = el.dataset.plan; }); break;
      case 'reset': if (confirm('Erase all students and sessions in this browser? Download a backup first if you might need it.')) commit('All data erased', () => { state = C.emptyState(); }); break;
      case 'dismissBanner': $banner.hidden = true; break;
    }
  });

  render();

  /* ---------- offline support ---------- */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => { /* offline mode unavailable */ }));
  }
})();
