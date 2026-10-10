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
  function commit(msg, mutate) {
    const before = JSON.stringify(state);
    mutate();
    save();
    render();
    lastUndo = () => { lastUndo = null; state = C.importState(before); save(); render(); toast('Undone'); };
    toast(msg, lastUndo);
  }
  let lastUndo = null;

  // Ctrl/Cmd+Z undoes the last change when you're not typing in a field.
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && lastUndo && !e.target.closest('input, textarea, select, [contenteditable]')) {
      e.preventDefault(); document.getElementById('toast').classList.remove('show'); lastUndo();
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

  let toastTimer;
  function toast(msg, undo) {
    const t = document.getElementById('toast');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button type="button" class="toast-undo">Undo</button>' : '');
    t.classList.add('show');
    if (undo) t.querySelector('.toast-undo').addEventListener('click', () => { t.classList.remove('show'); if (undo === lastUndo) undo(); }, { once: true });
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), undo ? 6000 : 2600);
  }

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

  function mailto(to, subject, body) {
    return 'mailto:' + encodeURIComponent(to || '') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  function formData(form) {
    const o = {};
    new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; });
    form.querySelectorAll('input[type=checkbox]').forEach(cb => { o[cb.name] = cb.checked; });
    return o;
  }

  function showErrors(form, errs) {
    const box = form.querySelector('.form-errors');
    box.innerHTML = errs.length ? '<ul>' + errs.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>' : '';
    if (errs.length) box.focus();
  }

  function clientOptions(selected, includeId) {
    const list = state.clients.filter(c => !c.archived || c.id === includeId);
    return list.map(c => `<option value="${esc(c.id)}"${c.id === selected ? ' selected' : ''}>${esc(c.name)}${c.subject ? ' · ' + esc(c.subject) : ''}${c.archived ? ' (archived)' : ''}</option>`).join('');
  }

  function noStudents(title) {
    return `<h1 tabindex="-1">${title}</h1><div class="card empty"><h2>No students yet</h2><p>Add your first student, or load sample data to look around.</p>
      <div class="actions center"><a class="btn" href="#students">Add a student</a><button class="btn ghost" data-act="demo">Load sample data</button></div></div>`;
  }

  /* ---------- views ---------- */
  const views = {
    dashboard() {
      const hello = state.profile.name ? 'Hi ' + esc(firstName(state.profile.name)) : 'Welcome to TutorLoop';
      if (!state.clients.length) {
        return `
          <h1 tabindex="-1">${hello}</h1>
          <p class="sub">The back office for student tutors.</p>
          <section class="card hero">
            <h2>Run your tutoring like a real business</h2>
            <p>Log a session in about 10 seconds, see who still owes you, send parents a progress update in one click, and export volunteer hours for your NHS sponsor. Free, private, and it works offline.</p>
            <div class="actions"><button class="btn" data-act="demo">Try it with sample data</button><a class="btn ghost" href="#students">Start with my own students</a></div>
            <p class="mt-s"><a href="#about">How it works, who it's for, and pricing</a></p>
          </section>
          <section class="card steps">
            <h2>Get set up in three steps</h2>
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
      return `
        <h1 tabindex="-1">${hello} 👋</h1>
        <p class="sub">Your tutoring business at a glance for ${esc(C.fmtMonth(m))}.</p>
        <div class="grid kpis">
          <div class="card kpi"><div class="label">Earned this month</div><div class="value">${C.money(s.earned)}</div><div class="hint">${s.paidHours} paid hrs${s.effectiveRate ? ' · ' + C.money(s.effectiveRate) + '/hr' : ''}</div></div>
          <div class="card kpi"><div class="label">Collected this month</div><div class="value good">${C.money(s.collected)}</div><div class="hint">${C.plural(s.sessions, 'session')} this month</div></div>
          <div class="card kpi"><div class="label">Unpaid (all time)</div><div class="value ${s.unpaidAll > 0 ? 'warn' : ''}">${C.money(s.unpaidAll)}</div><div class="hint">${bal.length ? C.plural(bal.length, 'family', 'families') + ' owe you' : 'all caught up'}</div></div>
          <div class="card kpi"><div class="label">Service hours</div><div class="value brand">${sp.hours}</div><div class="hint">${sp.goal ? sp.pct + '% of your ' + sp.goal + '-hour goal' : 'volunteer tutoring logged'}</div></div>
        </div>
        <div class="grid two mt">
          <section class="card"><h2>Earnings, last 6 months</h2>
            ${hasEarnings ? `<canvas id="chart" role="img" aria-label="Bar chart of earnings: ${esc(series.map(d => C.fmtMonth(d.month, 'short') + ' ' + C.money(d.earned)).join(', '))}"></canvas>`
              : '<p class="sub">Your earnings trend appears here after you log paid sessions.</p>'}
          </section>
          <section class="card"><h2>Who owes you</h2>
            ${bal.length ? `<table class="stack"><thead><tr><th scope="col">Student</th><th scope="col" class="num">Owed</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>
              ${bal.map(b => `<tr><td data-label="Student" class="who"><div><b>${esc(b.client.name)}</b><div class="muted small">${C.plural(b.unpaidSessions, 'unpaid session')} since ${esc(fd(b.oldestUnpaid))}</div></div></td>
              <td data-label="Owed" class="num warn"><b>${C.money(b.owed)}</b></td>
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
      const chip = m => `<button type="button" class="chip" data-act="setMinutes" data-min="${m}" aria-label="${m} minutes">${m}m</button>`;
      return `
        <h1 tabindex="-1">${editing ? 'Edit session' : 'Log a session'}</h1>
        <p class="sub">Takes about 10 seconds. Topics and notes power your parent updates.</p>
        <form class="card" id="sessionForm" data-id="${editing ? esc(editing.id) : ''}" novalidate>
          <div class="form-errors" tabindex="-1" role="alert"></div>
          <div class="row">
            <div class="wide-m"><label for="f-client">Student</label><select id="f-client" name="clientId">${clientOptions(s.clientId, s.clientId)}</select></div>
            <div><label for="f-date">Date</label><input id="f-date" name="date" type="date" value="${esc(s.date)}" required></div>
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
        <p class="sub">${plan === 'free' ? `Free plan: ${activeClients().length} of ${C.FREE_CLIENT_LIMIT} active students.` : (plan === 'club' ? 'Club plan' : 'Pro plan') + ': unlimited students.'}</p>
        <div class="grid two">
          <form class="card" id="clientForm" data-id="${editing ? esc(editing.id) : ''}" novalidate>
            <h2>${editing ? 'Edit ' + esc(editing.name) : 'Add a student'}</h2>
            ${atLimit ? `<p class="notice">You're at the Free plan limit. Archive a student you no longer tutor, or <a href="#settings">see plans</a>.</p>` : ''}
            <div class="form-errors" tabindex="-1" role="alert"></div>
            <div class="row"><div><label for="c-name">Student name</label><input id="c-name" name="name" maxlength="80" autocomplete="off" value="${esc(c.name)}" required></div>
              <div><label for="c-grade">Grade <span class="opt">(optional)</span></label><input id="c-grade" name="grade" maxlength="20" value="${esc(c.grade)}"></div></div>
            <div class="row"><div><label for="c-subject">Subject</label><input id="c-subject" name="subject" maxlength="80" placeholder="Algebra 1" value="${esc(c.subject)}"></div>
              <div><label for="c-rate">Rate ($/hr)</label><input id="c-rate" name="rate" type="number" inputmode="decimal" min="0" max="1000" step="0.01" value="${esc(c.rate)}"></div></div>
            <div class="row"><div><label for="c-pname">Parent name</label><input id="c-pname" name="parentName" maxlength="80" placeholder="Mrs. Chen" value="${esc(c.parentName)}"></div>
              <div><label for="c-pemail">Parent email</label><input id="c-pemail" name="parentEmail" type="email" maxlength="120" value="${esc(c.parentEmail)}"></div></div>
            <label class="check"><input type="checkbox" name="volunteerDefault" ${c.volunteerDefault ? 'checked' : ''}> Volunteer student (sessions default to service hours)</label>
            <div class="actions"><button class="btn" type="submit">${editing ? 'Save' : 'Add student'}</button>
              ${editing ? `<a class="btn ghost" href="#students">Cancel</a>${editing.archived ? '' : `<button type="button" class="btn danger" data-act="archiveClient" data-id="${esc(editing.id)}">Archive</button>`}` : ''}</div>
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
      return `
        <div class="no-print"><h1 tabindex="-1">Invoices</h1><p class="sub">Unpaid sessions roll into one invoice. Print it or save it as a PDF.</p>
          ${params[0] && !requested ? '<p class="notice">That student was not found, so the invoice with the largest balance is shown.</p>' : ''}
          <div class="toolbar"><label for="invPick" class="sr-only">Student</label><select id="invPick">${state.clients.map(c => `<option value="${esc(c.id)}"${c.id === id ? ' selected' : ''}>${esc(c.name)}${c.archived ? ' (archived)' : ''}</option>`).join('')}</select>
          <button class="btn" data-act="print" ${inv.items.length ? '' : 'disabled'}>Print / Save PDF</button>
          ${inv.items.length ? `<a class="btn ghost" href="${esc(mailto(inv.client.parentEmail, 'Tutoring balance for ' + inv.client.name, C.reminderMessage(state, id)))}">Email reminder</a>
            <button class="btn ghost" data-act="markPaidAll" data-id="${esc(id)}">Mark all paid</button>` : ''}</div></div>
        <article class="card invoice-doc" aria-label="Invoice preview">
          <div class="head"><div><h2 class="flush">${esc(p.business || p.name || 'Your tutoring business')}</h2><div class="muted">${esc(p.name && p.business ? p.name : '')}${p.email ? (p.name && p.business ? ' · ' : '') + esc(p.email) : ''}</div></div>
            <div class="right"><b>INVOICE</b><br>${esc(inv.number)}<br>${esc(C.fmtDate(today(), true))}</div></div>
          <p><b>Bill to:</b> ${esc(inv.client.parentName || 'Parent/guardian of ' + inv.client.name)}${inv.client.parentEmail ? ' · ' + esc(inv.client.parentEmail) : ''}<br>
            <b>Student:</b> ${esc(inv.client.name)}${inv.client.subject ? ' · ' + esc(inv.client.subject) : ''}</p>
          ${inv.items.length ? `<table><thead><tr><th scope="col">Date</th><th scope="col">Topics</th><th scope="col" class="num">Time</th><th scope="col" class="num">Amount</th></tr></thead><tbody>
            ${inv.items.map(i => `<tr><td>${esc(C.fmtDate(i.date, true))}</td><td>${esc(i.topics)}</td><td class="num">${i.minutes} min</td><td class="num">${C.money(i.amount)}</td></tr>`).join('')}
            </tbody><tfoot><tr><td colspan="3" class="num"><b>Total due</b></td><td class="num"><b>${C.money(inv.total)}</b></td></tr></tfoot></table>
            ${p.venmo ? `<p>Pay by: <b>${esc(p.venmo)}</b></p>` : '<p class="muted no-print">Tip: add your Venmo or Zelle handle in <a href="#settings">Settings</a> so it prints here.</p>'}` : '<p class="sub">No unpaid sessions for this student. 🎉</p>'}
          <p class="muted">Thank you!</p>
        </article>`;
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
            <div class="hint">${sp.remaining ? sp.remaining + ' hours to go of ' + sp.goal : 'Goal reached! 🎉'}</div>` : '<div class="hint mt-s">No goal set. <a href="#settings">Set an hour goal</a> to track progress.</div>'}</div></div>
        <section class="card mt hours-doc">
          <div class="print-only"><h2>Volunteer tutoring log</h2><p>Volunteer: ${esc(p.name || '________________')} · Total: ${sp.hours} hours · Printed ${esc(C.fmtDate(today(), true))}</p></div>
          <div class="toolbar no-print"><button class="btn" data-act="exportHours" ${vol.length ? '' : 'disabled'}>Export hours (CSV)</button><button class="btn ghost" data-act="print" ${vol.length ? '' : 'disabled'}>Print log for sponsor</button></div>
          ${vol.length ? sessionTable(vol, true) : '<p class="sub">No volunteer sessions yet. Tick "Volunteer session" when you log one.</p>'}
          <div class="print-only sign"><p>Sponsor signature: ______________________________ Date: ____________</p></div>
        </section>`;
    },

    about() {
      // Founder pitch / landing page. Every number here is either a list price, a published fee,
      // or arithmetic on those. There is no traction to report yet, and the page says so.
      const fee = price => Math.round((price * 0.029 + 0.30 + price * 0.007) * 100) / 100;   // Stripe card 2.9% + 30c, Billing 0.7%
      const row = (name, price, per) => { const f = fee(price); return `<tr><td data-label="Plan">${name}</td><td data-label="Price" class="num">${C.money(price)}${per}</td>
        <td data-label="Card + billing fees" class="num">${C.money(f)}</td><td data-label="TutorLoop keeps" class="num"><span><b>${C.money(price - f)}</b> (${Math.round((price - f) / price * 100)}%)</span></td></tr>`; };
      return `
        <h1 tabindex="-1">Why TutorLoop</h1>
        <p class="sub">The back office for student tutors: log it, get paid, keep parents in the loop, prove your hours.</p>
        <section class="card hero">
          <h2>Student tutors run real businesses with tools built for something else</h2>
          <p>A notes app for sessions, a Venmo feed to guess who paid, a text thread with each parent, and a paper sheet for volunteer hours. TutorLoop puts those four jobs in one free app that works in the browser, with no account and no server.</p>
          <div class="actions"><button class="btn" data-act="demo">Try it with sample data</button><a class="btn ghost" href="#students">Start with my own students</a></div>
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
            ${row('Club', 99, '/school yr')}
          </tbody></table>
          <p class="sub mt-s">Fees use Stripe's published US rates: 2.9% + 30¢ per card payment plus 0.7% for subscription billing. The flat 30¢ hurts small monthly charges, so an annual Pro option is the obvious next pricing test.</p>
          <p class="sub">Costs today: hosting is free (static files on GitHub Pages) and there is no server. Pro's sync and scheduled reminders are roadmap features; we won't charge for them until they exist.</p>
          <div class="actions"><a class="btn ghost" href="#settings">See the plans</a></div>
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
            <div class="row"><div><label for="p-email">Email on invoices</label><input id="p-email" name="email" type="email" maxlength="120" autocomplete="email" value="${esc(p.email)}"></div><div><label for="p-venmo">Venmo / Zelle handle</label><input id="p-venmo" name="venmo" maxlength="80" value="${esc(p.venmo)}"></div></div>
            <div class="row"><div><label for="p-goal">Service-hour goal <span class="opt">(optional)</span></label><input id="p-goal" name="serviceGoal" type="number" inputmode="decimal" min="0" max="1000" step="0.5" placeholder="e.g. 10" value="${esc(p.serviceGoal)}"></div><div></div></div>
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
        <div class="grid plans">
          ${plan('free', 'Free', '$0', '', ['Up to 3 active students', 'Session log &amp; dashboard', 'Parent updates &amp; payment reminders', 'Invoices and service-hour export'], `<button class="btn ghost" data-act="plan" data-plan="free">Switch to Free</button>`)}
          ${plan('pro', 'Pro', '$4', '/month', ['Unlimited students', 'Everything in Free', 'Cloud sync across devices <span class="tag">roadmap</span>', 'Scheduled reminders <span class="tag">roadmap</span>'], `<button class="btn" data-act="plan" data-plan="pro">Try Pro (demo)</button>`)}
          ${plan('club', 'Club', '$99', '/school year', ['For NHS chapters &amp; peer-tutoring clubs', 'Up to 50 tutors', 'Sponsor dashboard <span class="tag">roadmap</span>', 'Verified service-hour reports <span class="tag">roadmap</span>'], `<button class="btn ghost" data-act="plan" data-plan="club">Try Club (demo)</button>`)}
        </div>`;
    }
  };

  function sessionTable(list, hoursMode) {
    return `<table class="stack sessions${hoursMode ? ' hours' : ''}"><thead><tr><th scope="col">Date</th><th scope="col">Student</th><th scope="col">Topics</th><th scope="col" class="num">Min</th>${hoursMode ? '<th scope="col" class="num">Hours</th>' : '<th scope="col" class="num">Amount</th><th scope="col">Status</th>'}<th scope="col" class="no-print"><span class="sr-only">Actions</span></th></tr></thead><tbody>
      ${list.map(s => { const c = C.clientById(state, s.clientId) || {}; return `<tr><td data-label="Date">${esc(fd(s.date))}</td><td data-label="Student">${esc(c.name || 'Unknown')}</td><td data-label="Topics">${esc(s.topics) || '<span class="muted">-</span>'}</td>
        <td data-label="Minutes" class="num">${esc(s.minutes)}</td>
        ${hoursMode ? `<td data-label="Hours" class="num">${C.cents(s.minutes / 60)}</td>` : `<td data-label="Amount" class="num">${s.volunteer ? '<span class="muted">-</span>' : C.money(C.sessionAmount(s, c))}</td>
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
      if (d.earned > 0) { g.fillStyle = col('--ink'); g.fillText('$' + Math.round(d.earned), x + bw * 0.3, y - 6); }
      g.fillStyle = col('--muted');
      g.fillText(C.fmtMonth(d.month, 'short'), x + bw * 0.3, h - 10);
    });
  }

  /* ---------- router ---------- */
  let lastRoute = null;
  function parseHash() {
    const [route, ...params] = (location.hash.slice(1) || 'dashboard').split('/').map(p => { try { return decodeURIComponent(p); } catch (e) { return p; } });
    return { route: views[route] ? route : 'dashboard', params };
  }
  function render() {
    const { route, params } = parseHash();
    const key = route + '/' + params.join('/');
    const routeChanged = key !== lastRoute;
    $app.innerHTML = views[route](params);
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
      if (lastRoute !== null) { const h1 = document.querySelector('#app h1'); if (h1) h1.focus({ preventScroll: true }); }
      const act = document.querySelector('#nav a.active'); if (act && act.scrollIntoView && window.innerWidth < 720) act.scrollIntoView({ block: 'nearest', inline: 'center' });
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
    if (t.id === 'invPick') location.hash = 'invoices/' + encodeURIComponent(t.value);
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
        if ((state.clients.length || state.sessions.length) && !confirm(`Replace your current data with this backup (${C.plural(next.clients.length, 'student')}, ${C.plural(next.sessions.length, 'session')})?`)) return;
        commit('Backup restored', () => { state = next; });
      }).catch(err => toast(err.message));
    }
  });

  document.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target, d = formData(f);
    if (f.id === 'sessionForm') {
      d.minutes = d.minutes === '' ? NaN : Number(d.minutes); d.rate = d.rate === '' ? null : Number(d.rate);
      if (d.volunteer) d.paid = false;
      const errs = C.validateSession(d); if (errs.length) return showErrors(f, errs);
      const existing = f.dataset.id && state.sessions.find(s => s.id === f.dataset.id);
      const rec = { clientId: d.clientId, date: d.date, minutes: d.minutes, rate: d.rate, topics: d.topics, notes: d.notes, paid: !!d.paid, volunteer: !!d.volunteer };
      location.hash = 'dashboard';
      commit(existing ? 'Session updated' : 'Session saved', () => { if (existing) Object.assign(existing, rec); else state.sessions.push(Object.assign({ id: C.uid('s') }, rec)); });
    }
    if (f.id === 'clientForm') {
      const existing = f.dataset.id && C.clientById(state, f.dataset.id);
      const rec = { name: d.name, subject: d.subject, grade: d.grade, rate: d.rate === '' ? '' : Number(d.rate), parentName: d.parentName, parentEmail: d.parentEmail, volunteerDefault: !!d.volunteerDefault };
      const errs = C.validateClient(existing ? Object.assign({}, rec, { id: existing.id }) : rec, state);
      if (errs.length) return showErrors(f, errs);
      location.hash = 'students';
      commit(existing ? 'Student updated' : 'Student added', () => { if (existing) Object.assign(existing, rec); else state.clients.push(Object.assign({ id: C.uid('c'), archived: false }, rec)); });
    }
    if (f.id === 'profileForm') {
      const errs = [];
      if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) errs.push('Email looks invalid.');
      if (d.serviceGoal !== '' && (isNaN(Number(d.serviceGoal)) || Number(d.serviceGoal) < 0 || Number(d.serviceGoal) > 1000)) errs.push('Service-hour goal must be between 0 and 1,000.');
      if (errs.length) return showErrors(f, errs);
      commit('Profile saved', () => { Object.assign(state.profile, { name: d.name, business: d.business, email: d.email, venmo: d.venmo, serviceGoal: Number(d.serviceGoal) > 0 ? Number(d.serviceGoal) : '' }); });
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
      case 'setMinutes': { const m = document.getElementById('f-minutes'); m.value = el.dataset.min; updatePreview(); break; }
      case 'togglePaid': { const s = state.sessions.find(x => x.id === id); if (s) commit(s.paid ? 'Marked unpaid' : 'Marked paid', () => { s.paid = !s.paid; }); break; }
      case 'markPaidAll': { const c = C.clientById(state, id); commit('All of ' + firstName(c && c.name) + "'s sessions marked paid", () => { state.sessions.forEach(s => { if (s.clientId === id && !s.volunteer) s.paid = true; }); }); break; }
      case 'deleteSession': location.hash = 'dashboard'; commit('Session deleted', () => { state.sessions = state.sessions.filter(s => s.id !== id); }); break;
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
        commit(c.name + ' deleted', () => { state.clients = state.clients.filter(x => x.id !== id); state.sessions = state.sessions.filter(s => s.clientId !== id); });
        break;
      }
      case 'copyReport': copyText(document.getElementById('reportOut').value).then(ok => toast(ok ? 'Copied to clipboard' : 'Copy failed. Select the text and copy it manually.')); break;
      case 'print': window.print(); break;
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
