"""
End-to-end test in a real headless Chromium (Playwright for Python).

  pip install playwright && python -m playwright install chromium
  python tests/e2e.py                 # run the checks
  SHOTS=out/ python tests/e2e.py      # also save desktop + mobile screenshots of every page

Checks real-browser behaviour that unit tests and jsdom can't: native form validation, the
service worker / offline reload, layout overflow on a phone, accessibility (axe-core, if
node_modules/axe-core is installed), keyboard focus, and that nothing logs a console error.
"""
import json, os, pathlib, socket, subprocess, sys, tempfile, time
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = os.environ.get('SHOTS')
AXE_PATH = ROOT / 'node_modules' / 'axe-core' / 'axe.min.js'
ROUTES = ['dashboard', 'log', 'students', 'reports', 'invoices', 'hours', 'summary', 'settings', 'about']

results, failures = [], []
def check(name, cond, detail=''):
    (results if cond else failures).append(name + ('' if cond else f'  ->  {detail}'))
    print(('✓ ' if cond else '✗ ') + name + ('' if cond else f'  ->  {detail}'))

s = socket.socket(); s.bind(('127.0.0.1', 0)); PORT = s.getsockname()[1]; s.close()
# Serve the app from a sub-path, exactly like production (https://aariv.me/Tutorloop/), on an origin
# that also hosts other things. Bugs in service-worker scope, relative paths and cache cleanup only
# show up this way, never when the app sits at the server root.
SITE = pathlib.Path(tempfile.mkdtemp())
(SITE / 'Tutorloop').symlink_to(ROOT, target_is_directory=True)
(SITE / 'outside.txt').write_text('another site on the same origin')
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=SITE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
ORIGIN = f'http://127.0.0.1:{PORT}'
URL = f'{ORIGIN}/Tutorloop/'

def go(pg, route):
    pg.evaluate(f"location.hash = '{route}'"); pg.wait_for_timeout(150)

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None)
        ctx = b.new_context(viewport={'width': 1280, 'height': 900})
        pg = ctx.new_page()
        console = []
        pg.on('console', lambda m: m.type == 'error' and console.append(m.text))
        pg.on('pageerror', lambda e: console.append(str(e)))
        pg.on('dialog', lambda d: d.accept())
        pg.goto(URL); pg.wait_for_timeout(400)

        # empty state
        check('empty state shows onboarding, not a wall of $0 KPIs', pg.locator('.hero').count() == 1 and pg.locator('.kpi').count() == 0)
        if SHOTS: pathlib.Path(SHOTS).mkdir(parents=True, exist_ok=True); pg.screenshot(path=f'{SHOTS}/desk-00-empty.png', full_page=True)

        # first student via the real form
        go(pg, 'students')
        pg.fill('#c-name', 'Test <img src=x onerror=alert(1)>'); pg.fill('#c-rate', '22.50'); pg.fill('#c-pemail', 'mom@example.com')
        pg.click('#clientForm button[type=submit]'); pg.wait_for_timeout(200)
        check('student with decimal rate saves', pg.locator('text=$22.50').count() >= 1, pg.inner_text('#app')[:200])
        check('student name is escaped, not executed (XSS)', pg.locator('#app img[src=x]').count() == 0 and 'onerror' in pg.inner_text('#app'))

        # log a session with the DEFAULT minutes using a real click (native validation applies)
        go(pg, 'log')
        pg.fill('#f-topics', '=HYPERLINK("http://evil"), fractions'); pg.fill('#f-notes', 'Improved a lot, confident with fractions')
        pg.click('#sessionForm button[type=submit]'); pg.wait_for_timeout(250)
        saved = pg.evaluate("JSON.parse(localStorage.getItem('tutorloop.v1')).sessions.length")
        check('session saves with the default 60 minutes (native validation passes)', saved == 1, f'sessions={saved}, hash={pg.evaluate("location.hash")}')
        check('dashboard shows the $22.50 unpaid', '$22.50' in pg.inner_text('#app'))

        # quick duration chip + odd minutes
        go(pg, 'log'); pg.click('[data-act=setMinutes][data-min="45"]')
        check('quick-duration chip sets minutes and live preview', pg.input_value('#f-minutes') == '45' and '$16.88' in pg.inner_text('#amountPreview'), pg.inner_text('#amountPreview'))
        pg.fill('#f-minutes', '52'); pg.click('#sessionForm button[type=submit]'); pg.wait_for_timeout(200)
        check('odd durations like 52 minutes are accepted', pg.evaluate("JSON.parse(localStorage.getItem('tutorloop.v1')).sessions.length") == 2)

        # invalid input shows an accessible error
        go(pg, 'log'); pg.fill('#f-minutes', ''); pg.click('#sessionForm button[type=submit]'); pg.wait_for_timeout(100)
        check('empty minutes shows an inline error', 'Duration must be' in pg.inner_text('.form-errors'))
        # a typo year (2062) must not land in every balance and reminder; the date picker also stops at tomorrow
        go(pg, 'log'); pg.fill('#f-date', '2062-10-11'); pg.click('#sessionForm button[type=submit]'); pg.wait_for_timeout(150)
        n_sess = pg.evaluate("JSON.parse(localStorage.getItem('tutorloop.v1')).sessions.length")
        check('future-dated session (2062) is refused with a "check the year" error, nothing saved',
              'Check the year' in pg.inner_text('.form-errors') and n_sess == 2 and pg.get_attribute('#f-date', 'max') is not None, pg.inner_text('#app')[:300])
        # a second student with the same name (other case/spaces) is refused
        go(pg, 'students')
        pg.fill('#c-name', '  TEST <IMG SRC=X ONERROR=ALERT(1)> '); pg.fill('#c-rate', '20')
        pg.click('#clientForm button[type=submit]'); pg.wait_for_timeout(200)
        check('duplicate student name is refused with a clear error',
              'already have a student named' in pg.inner_text('.form-errors') and pg.evaluate("JSON.parse(localStorage.getItem('tutorloop.v1')).clients.length") == 1, pg.inner_text('#app')[:300])

        # undo
        go(pg, 'dashboard'); pg.click('[data-act=markPaidAll]'); pg.wait_for_timeout(150)
        unpaid_after = pg.evaluate("JSON.parse(localStorage.getItem('tutorloop.v1')).sessions.filter(s=>!s.paid).length")
        pg.click('.toast-undo'); pg.wait_for_timeout(150)
        unpaid_undo = pg.evaluate("JSON.parse(localStorage.getItem('tutorloop.v1')).sessions.filter(s=>!s.paid).length")
        check('"Mark paid" can be undone from the toast', unpaid_after == 0 and unpaid_undo == 2, f'{unpaid_after} -> {unpaid_undo}')

        # CSV formula injection in a real download
        go(pg, 'settings')
        with pg.expect_download() as dl: pg.click('[data-act=exportSessions]')
        csv = open(dl.value.path(), encoding='utf-8').read()
        check('exported CSV neutralises formulas', "'=HYPERLINK" in csv and '\n=HYPERLINK' not in csv)

        # sample data + free plan limit + archive/restore
        pg.click('#app [data-act=demo]'); pg.wait_for_timeout(250)
        check('sample data loads', 'Ethan Brooks' in pg.inner_text('#app'))
        go(pg, 'students')
        check('at the Free limit the Add-student form is disabled, not a trap', pg.is_disabled('#c-name') and pg.is_disabled('#clientForm button[type=submit]'))
        check('the limit note says why and how to free a spot', 'adding is paused' in pg.inner_text('#limitNote') and 'Archive' in pg.inner_text('#limitNote') and pg.locator('#limitNote a[href="#settings"]').count() == 1)
        check('the disabled fields point at the limit note (aria-describedby)', pg.get_attribute('#clientForm fieldset', 'aria-describedby') == 'limitNote')
        pg.evaluate("document.querySelector('#clientForm fieldset').disabled = false"); pg.fill('#c-name', 'Fourth Kid'); pg.click('#clientForm button[type=submit]'); pg.wait_for_timeout(100)
        check('free plan still blocks a 4th active student if the form is forced open', 'Free plan includes 3' in pg.inner_text('.form-errors'))
        go(pg, 'students/c_maya')
        check('editing an existing student still works at the limit', not pg.is_disabled('#c-name') and pg.locator('#limitNote').count() == 0)
        go(pg, 'dashboard')
        check('sample bar says the parent emails are example.com placeholders', 'example.com' in pg.inner_text('.samplebar'))
        go(pg, 'students/c_sofia'); pg.click('[data-act=archiveClient]'); pg.wait_for_timeout(150)
        check('archiving moves student to the Archived list', pg.locator('details summary', has_text='Archived (1)').count() == 1)
        pg.click('details summary'); pg.click('[data-act=restoreClient]'); pg.wait_for_timeout(150)
        check('archived student can be restored', pg.locator('details summary').count() == 0)
        go(pg, 'students/c_sofia'); pg.click('[data-act=archiveClient]'); pg.wait_for_timeout(150)
        pg.click('details summary'); pg.click('[data-act=deleteClient]'); pg.wait_for_timeout(150)
        st = pg.evaluate("JSON.parse(localStorage.getItem('tutorloop.v1'))")
        check('archived student can be deleted permanently with their sessions', len(st['clients']) == 2 and not [x for x in st['sessions'] if x['clientId'] == 'c_sofia'])
        pg.click('#app h1'); pg.keyboard.press('Control+z'); pg.wait_for_timeout(150)
        check('Ctrl+Z undoes the last change', len(pg.evaluate("JSON.parse(localStorage.getItem('tutorloop.v1')).clients")) == 3)
        pg.keyboard.press('Control+z'); pg.wait_for_timeout(100)
        check('a second Ctrl+Z does nothing (single-step undo, no double apply)', len(pg.evaluate("JSON.parse(localStorage.getItem('tutorloop.v1')).clients")) == 3)
        if pg.evaluate("JSON.parse(localStorage.getItem('tutorloop.v1')).clients.find(c => c.id === 'c_sofia').archived"):
            pg.click('details summary'); pg.click('[data-act=restoreClient]'); pg.wait_for_timeout(150)

        # parent update: auto-generated, editable, presets
        go(pg, 'reports')
        txt = pg.input_value('#reportOut')
        check('parent update is generated on open', txt.startswith('Hi Mrs. Chen,') and 'Highlight' in txt, txt[:120])
        pg.select_option('#r-preset', 'all'); pg.wait_for_timeout(100)
        check('"All sessions" preset includes every session', '5 (5 hours total)' in pg.input_value('#reportOut'), pg.input_value('#reportOut')[:200])
        pg.fill('#reportOut', 'Edited message'); pg.wait_for_timeout(50)
        check('edited text flows into the email link', 'Edited%20message' in pg.get_attribute('#mailReport', 'href'))

        # invoice: unknown id does not crash
        go(pg, 'invoices/doesnotexist')
        check('unknown invoice id falls back gracefully', 'not found' in pg.inner_text('#app') and pg.locator('.invoice-doc').count() == 1)

        # payment wording + opt-in "Sent with TutorLoop" footer, set from Settings
        go(pg, 'settings')
        prev = pg.inner_text('#payPreview')
        check('settings previews the payment sentence (no "pay by @handle")', 'You can pay with Venmo @aariv-tutoring.' in prev, prev)
        pg.fill('#p-venmo', 'tutor@example.com'); pg.fill('#p-paymethod', 'Zelle'); pg.wait_for_timeout(50)
        check('payment preview updates live as you type', 'You can pay with Zelle tutor@example.com.' in pg.inner_text('#payPreview'), pg.inner_text('#payPreview'))
        check('referral footer is off until the tutor opts in', not pg.is_checked('#p-referral'))
        pg.check('#p-referral'); pg.click('#profileForm button[type=submit]'); pg.wait_for_timeout(200)
        prof = pg.evaluate("JSON.parse(localStorage.getItem('tutorloop.v1')).profile")
        check('payment app and footer choice are saved', prof.get('payMethod') == 'Zelle' and prof.get('referralFooter') is True, prof)
        go(pg, 'invoices/c_ethan')
        inv = pg.inner_text('.invoice-doc')
        href = pg.get_attribute('a.btn.ghost[href^="mailto:"]', 'href') or ''
        check('invoice and reminder use the configured app, and carry the opted-in footer',
              'Pay with: Zelle tutor@example.com' in inv and 'Sent with TutorLoop' in inv
              and 'Zelle%20tutor%40example.com' in href and 'Sent%20with%20TutorLoop' in href, inv[-200:])
        go(pg, 'settings'); pg.uncheck('#p-referral'); pg.click('#profileForm button[type=submit]'); pg.wait_for_timeout(200)
        go(pg, 'invoices/c_ethan')
        check('turning the footer off removes it', 'Sent with TutorLoop' not in pg.inner_text('.invoice-doc'))

        # Why TutorLoop: sourced competitor prices
        go(pg, 'about')
        about = pg.inner_text('#app')
        check('about page compares TutorBird and Teachworks list prices with sources',
              all(x in about for x in ('$16.95/mo', '$4.95 per additional tutor', '$16.49/mo', '$0.32 per student lesson', '$19.05'))
              and pg.locator('a[href="https://www.tutorbird.com/pricing/"]').count() == 1
              and pg.locator('a[href="https://teachworks.com/pricing"]').count() == 1, about[-600:])

        # restore backup (round trip)
        go(pg, 'settings')
        with pg.expect_download() as dl: pg.click('[data-act=exportJson]')
        backup = dl.value.path()
        pg.click('[data-act=reset]'); pg.wait_for_timeout(150)
        check('erase all data empties the app', pg.evaluate("JSON.parse(localStorage.getItem('tutorloop.v1')).sessions.length") == 0)
        go(pg, 'settings'); pg.set_input_files('#importFile', backup); pg.wait_for_timeout(300)
        check('backup restores', pg.evaluate("JSON.parse(localStorage.getItem('tutorloop.v1')).sessions.length") == 12)

        # corrupt storage is parked, not overwritten
        pg.evaluate("localStorage.setItem('tutorloop.v1', '{broken')"); pg.reload(); pg.wait_for_timeout(300)
        parked = pg.evaluate("Object.keys(localStorage).filter(k => k.startsWith('tutorloop.v1.unreadable')).length")
        check('unreadable saved data is kept aside and the user is told', parked == 1 and pg.is_visible('#banner'))

        # keyboard: skip link + focus moves to the page heading on navigation
        pg.keyboard.press('Tab')
        check('first Tab reaches the skip link', pg.evaluate("document.activeElement.className") == 'skip')
        pg.click('#nav a[href="#students"]'); pg.wait_for_timeout(150)
        check('focus moves to the page heading after navigation', pg.evaluate("document.activeElement.tagName") == 'H1')
        check('active nav item has aria-current', pg.get_attribute('#nav a[href="#students"]', 'aria-current') == 'page')

        # offline: service worker caches the shell
        pg.click('#app [data-act=demo]') if pg.locator('#app [data-act=demo]').count() else None
        pg.goto(URL); pg.wait_for_timeout(300)
        pg.evaluate("navigator.serviceWorker.ready"); pg.wait_for_timeout(800)
        pg.reload(); pg.wait_for_timeout(500)  # second load is controlled by the SW and fills the cache
        ctx.set_offline(True); pg.reload(); pg.wait_for_timeout(500)
        check('app reloads with no network (service worker)', pg.locator('#nav').count() == 1 and pg.locator('#app h1').count() == 1)
        ctx.set_offline(False)
        check('no console errors during the whole flow', not [c for c in console if 'net::ERR_INTERNET_DISCONNECTED' not in c], console)
        ctx.close()

        # service worker on a shared origin: stays in its lane
        ctx = b.new_context(); pg = ctx.new_page()
        sw_console = []
        pg.on('console', lambda m: m.type == 'error' and sw_console.append(m.text))
        pg.on('pageerror', lambda e: sw_console.append(str(e)))
        pg.goto(ORIGIN + '/outside.txt')
        pg.evaluate("caches.open('other-site').then(c => c.put('/outside.txt', new Response('x')))"); pg.wait_for_timeout(150)
        pg.goto(URL); pg.evaluate("navigator.serviceWorker.ready"); pg.wait_for_timeout(1000)
        reg = pg.evaluate("navigator.serviceWorker.getRegistration().then(r => r && r.scope)")
        check('service worker scope is the app sub-path (/Tutorloop/)', reg == URL, reg)
        keys = pg.evaluate("caches.keys()")
        check("SW cleanup leaves other sites' caches on the same origin alone", 'other-site' in keys and any(k.startswith('tutorloop-') for k in keys), keys)
        man = pg.evaluate("""async () => { const u = new URL(document.querySelector('link[rel=manifest]').getAttribute('href'), location.href);
            const m = await (await fetch(u)).json(); const abs = x => new URL(x, u).href;
            const icons = await Promise.all(m.icons.map(async i => (await fetch(abs(i.src))).status));
            return { start: abs(m.start_url), scope: abs(m.scope), icons }; }""")
        check('manifest start_url and scope resolve under the sub-path', man['start'].startswith(URL) and man['scope'] == URL, man)
        check('every manifest icon loads', all(x == 200 for x in man['icons']), man['icons'])
        pg.reload(); pg.wait_for_timeout(400)
        pg.evaluate("fetch('/outside.txt')"); pg.wait_for_timeout(400)
        leaked = pg.evaluate("caches.keys().then(async ks => { for (const k of ks) if (k.startsWith('tutorloop-') && await (await caches.open(k)).match('/outside.txt')) return true; return false; })")
        check('SW does not cache URLs outside its scope', not leaked)
        ctx.set_offline(True)
        miss = pg.evaluate("fetch('js/missing.js').then(r => r.status + ' ' + (r.headers.get('content-type') || '')).catch(e => 'error')")
        check('offline: a missing script is not answered with index.html', not miss.startswith('200') and 'text/html' not in miss, miss)
        pg.goto(URL + '?utm_source=devpost#about'); pg.wait_for_timeout(500)
        check('offline: a deep link with a query string opens the cached app', pg.locator('#app h1', has_text='Why TutorLoop').count() == 1)
        ctx.set_offline(False)
        # (the 504 for js/missing.js and the 404 for /favicon.ico on the plain-text page are provoked on purpose)
        check('no console errors on the shared-origin SW checks', not [c for c in sw_console if not any(x in c for x in ('ERR_INTERNET_DISCONNECTED', '(Offline)', '(File not found)'))], sw_console)
        ctx.close()

        # scale: 50 students and 5,000 sessions (about 0.9 MB) still render fast, amounts get thousands separators, and email links stay short
        big_json = subprocess.check_output(['node', '-e', """
const C=require(process.argv[1]);const s=C.demoState('2026-10-10');const base=s.clients[0];
for(let i=0;i<46;i++)s.clients.push(Object.assign({},base,{id:'c'+i,name:'Student '+i,archived:false,rate:40}));
const ids=s.clients.map(c=>c.id);
for(let i=0;i<5000;i++){const d=new Date(Date.UTC(2026,9,10)-i*86400000*0.4);s.sessions.push({id:'s'+i,clientId:ids[i%ids.length],date:d.toISOString().slice(0,10),minutes:30+(i%4)*15,rate:null,topics:'topic '+i+', fractions',notes:'went well',paid:i%3==0,volunteer:i%7==0});}
console.log(JSON.stringify(s));""", str(ROOT / 'js' / 'core.js')]).decode()
        ctx = b.new_context(viewport={'width': 1280, 'height': 900}); pg = ctx.new_page()
        big_errs = []
        pg.on('pageerror', lambda e: big_errs.append(str(e)))
        pg.goto(URL); pg.evaluate("d => localStorage.setItem('tutorloop.v1', d)", big_json); pg.reload(); pg.wait_for_timeout(500)
        t_dash = pg.evaluate("() => { const t = performance.now(); location.hash = 'summary'; window.dispatchEvent(new HashChangeEvent('hashchange')); location.hash = 'dashboard'; window.dispatchEvent(new HashChangeEvent('hashchange')); return performance.now() - t; }")
        check(f'scale: dashboard re-renders in under 1.5 s with 5,000 sessions and 50 students ({t_dash:.0f} ms)', t_dash < 1500, t_dash)
        kpis = pg.inner_text('.kpis')
        check('scale: big amounts use thousands separators', ',' in kpis and '$' in kpis, kpis[:200])
        longest = pg.evaluate("Math.max(...[...document.querySelectorAll('a[href^=\"mailto:\"]')].map(a => a.href.length))")
        check('scale: every Remind email link stays under 8,200 characters', 0 < longest < 8200, longest)
        check('scale: no page errors', not big_errs, big_errs)
        ctx.close()

        # first run: quick start gets a tutor from an empty app to a drafted parent update; toasts go away
        axe_src = AXE_PATH.read_text() if AXE_PATH.exists() else None
        ctx = b.new_context(viewport={'width': 1280, 'height': 900}, bypass_csp=True); pg = ctx.new_page()
        qs_console = []
        pg.on('console', lambda m: m.type == 'error' and qs_console.append(m.text)); pg.on('pageerror', lambda e: qs_console.append(str(e)))
        pg.on('dialog', lambda d: d.accept())
        pg.goto(URL); pg.wait_for_timeout(300)
        if axe_src:
            pg.add_script_tag(content=axe_src)
            v = pg.evaluate("async () => (await axe.run(document, {runOnly: ['wcag2a','wcag2aa','wcag21aa','best-practice']})).violations.map(v => v.id + ' ' + v.nodes.slice(0,2).map(n => n.target.join(' ')).join(' | '))")
            check('axe empty dashboard with quick-start form: no violations', not v, v)
        t0 = time.time()
        pg.fill('#q-name', 'Riya Shah'); pg.fill('#q-rate', '20'); pg.click('#quickForm [data-min="45"]')
        pg.fill('#q-topics', 'fractions, ratios'); pg.fill('#q-notes', 'Improved on fractions, confident now')
        pg.click('#quickForm button[type=submit]'); pg.wait_for_selector('.firstrun')
        took = time.time() - t0
        st = pg.evaluate("JSON.parse(localStorage.getItem('tutorloop.v1'))")
        check('quick start creates the student and a 45-minute session in one submit', len(st['clients']) == 1 and len(st['sessions']) == 1 and st['sessions'][0]['minutes'] == 45, st)
        callout = pg.inner_text('.firstrun')
        check('first-run callout shows the drafted parent update and a $15.00 invoice', 'Riya is making clear progress' in callout and '$15.00' in callout, callout[:300])
        check('focus moves to the first-run callout heading', pg.evaluate("document.activeElement.id") == 'fr-title')
        check(f'quick start to "aha" takes well under 30s of app time ({took:.1f}s scripted)', took < 30)
        if axe_src:
            pg.wait_for_timeout(400)  # let the toast finish fading in; axe misreads contrast mid-transition
            v = pg.evaluate("async () => (await axe.run(document, {runOnly: ['wcag2a','wcag2aa','wcag21aa','best-practice']})).violations.map(v => v.id + ' ' + v.nodes.slice(0,2).map(n => n.target.join(' ')).join(' | '))")
            check('axe first-run dashboard: no violations', not v, v)
        # the bug: the "Sample data loaded" Undo toast used to linger in the page after fading out
        go(pg, 'settings'); pg.click('#app [data-act=demo]'); pg.wait_for_timeout(300)
        check('"Sample data loaded" toast appears with Undo and a close button', pg.is_visible('#toast .toast-undo') and pg.is_visible('#toast .toast-close') and 'Sample data loaded' in pg.inner_text('#toast'))
        pg.mouse.move(5, 5); pg.wait_for_timeout(8600)
        gone = pg.evaluate("(() => { const t = document.getElementById('toast'); return { hidden: t.hidden, html: t.innerHTML, display: getComputedStyle(t).display }; })()")
        check('toast auto-dismisses within ~8s and is removed (hidden, no leftover Undo button)', gone['hidden'] and gone['html'] == '' and gone['display'] == 'none', gone)
        go(pg, 'students/c_ethan'); pg.click('#clientForm button[type=submit]'); pg.wait_for_timeout(200)
        pg.hover('#toast'); pg.wait_for_timeout(8600)
        check('toast stays while hovered (time to reach Undo)', pg.is_visible('#toast .toast-undo'))
        pg.click('#toast .toast-close'); pg.wait_for_timeout(400)
        check('close button removes the toast', pg.evaluate("document.getElementById('toast').hidden"))
        pg.click('#app h1'); pg.keyboard.press('Control+z'); pg.wait_for_timeout(200)
        check('Ctrl+Z still undoes after the toast is gone', pg.evaluate("document.getElementById('toast').textContent").startswith('Undone'))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
        check('Escape dismisses a toast', pg.evaluate("document.getElementById('toast').hidden"))
        # monthly summary: family statement + whole-month recap, copy as text
        go(pg, 'summary'); pg.wait_for_timeout(150)
        months = pg.eval_on_selector_all('#sumMonth option', 'os => os.map(o => o.value)')
        pg.select_option('#sumMonth', months[1]); pg.wait_for_timeout(200)
        check('summary month picker changes the URL', pg.evaluate("location.hash") == '#summary/' + months[1])
        pg.select_option('#sumWho', 'c_maya'); pg.wait_for_timeout(200)
        doc = pg.inner_text('.summary-doc')
        check('family statement lists sessions with paid/unpaid status', 'Maya Chen: tutoring summary' in doc and ('paid' in doc), doc[:200])
        mail = pg.get_attribute('a[href^="mailto:"]', 'href') or ''
        check('statement opens in email addressed to the parent', mail.startswith('mailto:parent.chen%40example.com'), mail[:80])
        # part payment: type an amount in a real browser, balance drops by exactly that, the form validates, undo works
        go(pg, 'invoices/c_ethan'); pg.wait_for_timeout(200)
        check('invoice page offers Record a payment while money is owed', pg.is_visible('#payForm') and pg.is_visible('#pay-amount'))
        before = pg.evaluate("TutorCore.balances(JSON.parse(localStorage.getItem('tutorloop.v1'))).find(b => b.client.id === 'c_ethan').owed")
        pg.fill('#pay-amount', '-3'); pg.click('#payForm button[type=submit]'); pg.wait_for_timeout(150)
        check('a negative payment is refused with a message', 'greater than $0' in pg.inner_text('#payForm .form-errors'))
        pg.fill('#pay-amount', '12.34'); pg.click('#payForm button[type=submit]'); pg.wait_for_timeout(300)
        after = pg.evaluate("TutorCore.balances(JSON.parse(localStorage.getItem('tutorloop.v1'))).find(b => b.client.id === 'c_ethan').owed")
        check('a $12.34 payment lowers the balance by exactly $12.34', abs((before - after) - 12.34) < 0.001, (before, after))
        check('the part-paid line and payment history show on the invoice', 'already paid' in pg.inner_text('.invoice-doc') and pg.locator('.pay-history').count() == 1)
        check('focus returns to the amount field for the next payment', pg.evaluate("document.activeElement && document.activeElement.id") == 'pay-amount')
        go(pg, 'dashboard'); pg.wait_for_timeout(150)
        pp = pg.eval_on_selector_all('.part-paid', 'els => els.map(e => e.textContent)')
        check('dashboard "Who owes you" shows the part-paid state ($12.34 of $90.00 paid)', '$12.34 of $90.00 paid' in pp, pp)
        mon = pg.evaluate("JSON.parse(localStorage.getItem('tutorloop.v1')).payments.slice(-1)[0].date.slice(0, 7)")
        go(pg, f'summary/{mon}/c_ethan'); pg.wait_for_timeout(150)
        sec = pg.inner_text('.statement-payments') if pg.locator('.statement-payments').count() else ''
        check('family statement has a Payments section with the $12.34 received this month', 'Payments received in' in sec and '$12.34' in sec, sec)
        pg.click('.toast-undo'); pg.wait_for_timeout(300)
        back = pg.evaluate("TutorCore.balances(JSON.parse(localStorage.getItem('tutorloop.v1'))).find(b => b.client.id === 'c_ethan').owed")
        check('Undo restores the balance', abs(back - before) < 0.001, (before, back))
        # sample-data mode: a visible way back to a clean start (before, the only exit was Settings > Erase all data)
        go(pg, 'invoices'); pg.wait_for_timeout(150)
        check('sample-data bar shows on app pages while sample data is loaded', pg.is_visible('.samplebar') and 'made-up students' in pg.inner_text('.samplebar'))
        go(pg, 'about'); pg.wait_for_timeout(150)
        check('sample-data bar stays off the pitch page', pg.locator('.samplebar').count() == 0)
        go(pg, 'dashboard'); pg.wait_for_timeout(150)
        pill_h = pg.evaluate("Math.min(...[...document.querySelectorAll('button.pill')].map(b => b.getBoundingClientRect().height))")
        check(f'paid/unpaid toggle buttons meet the 24px WCAG 2.2 target size ({pill_h:.0f}px)', pill_h >= 24, pill_h)
        go(pg, 'invoices'); pg.wait_for_timeout(150)
        pg.click('.samplebar [data-act=startFresh]'); pg.wait_for_timeout(600)
        st = pg.evaluate("JSON.parse(localStorage.getItem('tutorloop.v1'))")
        check('Start fresh clears the sample data', len(st['clients']) == 0 and len(st['sessions']) == 0 and not st.get('sample'), st)
        check('Start fresh lands on the dashboard with focus in the quick-start form', pg.evaluate("location.hash") == '#dashboard' and pg.evaluate("document.activeElement.id") == 'q-name', pg.evaluate("[location.hash, document.activeElement.id]"))
        check('sample-data bar is gone after Start fresh', pg.locator('.samplebar').count() == 0)
        pg.evaluate("window.scrollTo(0, 0); document.activeElement.blur()")
        pg.click('.hero [data-act=focusQuick]'); pg.wait_for_timeout(300)
        check('hero "Start with my own students" goes straight to the quick-start form', pg.evaluate("document.activeElement.id") == 'q-name')
        pg.click('#toast .toast-undo'); pg.wait_for_timeout(300)
        check('Start fresh can be undone (sample data and its bar come back)', len(pg.evaluate("JSON.parse(localStorage.getItem('tutorloop.v1'))")['clients']) == 3 and pg.is_visible('.samplebar'))
        # founders pitch: who pays and how we reach them
        go(pg, 'about'); pg.wait_for_timeout(150)
        mk = pg.inner_text('#app')
        check('pitch page sizes the NHS channel with sources and an honest ceiling', '17,000+ chapters' in mk and '$1.6 million' in mk and 'Ceiling, not a forecast' in mk and 'nationalhonorsociety.org/about' in pg.inner_html('#app'), mk[:200])
        check('pitch page lays out go-to-market in order', 'Sponsor wedge' in mk and 'Go-to-market, in order' in mk)
        check('Business model table has an Annual Pro row ($36.00/yr, $1.60 fees, $34.40 kept) and a who-pays note',
              pg.locator('tr', has_text='Pro (annual)').count() == 1 and '$36.00/yr' in mk and '$34.40 (96%)' in mk and 'Who pays:' in mk and 'No paying customers yet' in mk, mk[:300])
        check('no console errors in first-run, toast, and summary flows', not qs_console, qs_console)
        ctx.close()

        # empty app: the Why page "Start with my own students" and the empty-page "Add a student" go to the quick-start form
        ctx = b.new_context(viewport={'width': 390, 'height': 844}); pg = ctx.new_page()
        em_console = []
        pg.on('console', lambda m: m.type == 'error' and em_console.append(m.text)); pg.on('pageerror', lambda e: em_console.append(str(e)))
        pg.goto(URL + '#about'); pg.wait_for_timeout(400)
        pg.click('#app [data-act=startOwn]'); pg.wait_for_timeout(400)
        check('empty app: Why page "Start with my own students" lands on the dashboard quick-start form', pg.evaluate("[location.hash, document.activeElement.id]") == ['#dashboard', 'q-name'], pg.evaluate("[location.hash, document.activeElement.id]"))
        go(pg, 'reports'); pg.click('#app [data-act=startOwn]'); pg.wait_for_timeout(400)
        check('empty app: "Add a student" on an empty page lands on the quick-start form', pg.evaluate("[location.hash, document.activeElement.id]") == ['#dashboard', 'q-name'], pg.evaluate("[location.hash, document.activeElement.id]"))
        pg.click('#app [data-act=demo]'); pg.wait_for_timeout(300); go(pg, 'about')
        pg.click('#app [data-act=startOwn]'); pg.wait_for_timeout(300)
        check('with students, "Start with my own students" still opens #students', pg.evaluate("location.hash") == '#students')
        check('no console errors in the empty-app routing checks', not em_console, em_console)
        ctx.close()

        # keyboard-only pass of "Record a payment" on a phone and a laptop: focus order, errors announced in a
        # live region and linked to the field, no traps, Escape/Undo on the toast return focus, and focus never lands on <body>
        AE = "(() => { const e = document.activeElement; return e ? (e.id || e.className || e.tagName) : ''; })()"
        owed_ethan = "TutorCore.balances(JSON.parse(localStorage.getItem('tutorloop.v1'))).find(b => b.client.id === 'c_ethan').owed"
        for w in (390, 1280):
            ctx = b.new_context(viewport={'width': w, 'height': 844}); pg = ctx.new_page()
            kb_console = []
            pg.on('console', lambda m: m.type == 'error' and kb_console.append(m.text)); pg.on('pageerror', lambda e: kb_console.append(str(e)))
            pg.on('dialog', lambda d: d.accept())
            pg.goto(URL); pg.wait_for_timeout(300); pg.click('#app [data-act=demo]'); pg.wait_for_timeout(300)
            pg.evaluate("location.hash = 'invoices/c_ethan'"); pg.wait_for_timeout(300)
            order = []
            for _ in range(6):
                pg.keyboard.press('Tab'); order.append(pg.evaluate("(() => { const e = document.activeElement; return e.id || e.textContent.trim(); })()"))
            check(f'kbd {w}px: Tab order is student, Print, Email reminder, Mark all paid, amount, Record payment',
                  order == ['invPick', 'Print / Save PDF', 'Email reminder', 'Mark all paid', 'pay-amount', 'Record payment'], order)
            pg.keyboard.press('Shift+Tab'); pg.keyboard.type('-3'); pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
            err = pg.evaluate("(() => { const b = document.querySelector('#payForm .form-errors'), a = document.getElementById('pay-amount'); return [b.getAttribute('role') || b.getAttribute('aria-live'), b.textContent, document.activeElement === b, a.getAttribute('aria-invalid'), a.getAttribute('aria-describedby') === b.id]; })()")
            check(f'kbd {w}px: a bad amount is announced in a live region, focused, and linked to the field',
                  err[0] in ('alert', 'assertive') and 'greater than $0' in err[1] and err[2] and err[3] == 'true' and err[4], err)
            pg.keyboard.press('Tab'); a1 = pg.evaluate(AE); pg.keyboard.press('Shift+Tab'); a2 = pg.evaluate(AE)
            pg.focus('#pay-amount'); pg.keyboard.press('Tab'); pg.keyboard.press('Tab'); a3 = pg.evaluate("!!document.activeElement.closest('#payForm')")
            check(f'kbd {w}px: no keyboard trap after an error (Tab, Shift+Tab, and Tab out of the form all work)', a1 == 'pay-amount' and a2 != 'pay-amount' and a2 != 'pay-errors' and not a3, (a1, a2, a3))
            before = pg.evaluate(owed_ethan)
            pg.focus('#pay-amount'); pg.fill('#pay-amount', ''); pg.keyboard.type('5'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
            t = pg.evaluate("(() => { const t = document.getElementById('toast'); return [t.getAttribute('role'), t.getAttribute('aria-live'), t.textContent]; })()")
            check(f'kbd {w}px: Enter records the payment, the result is announced (role=status, polite), focus stays on the amount',
                  t[0] == 'status' and t[1] == 'polite' and '$5.00 recorded for Ethan' in t[2] and pg.evaluate(AE) == 'pay-amount', (t, pg.evaluate(AE)))
            n = 0
            while pg.evaluate(AE) != 'toast-undo' and n < 30: pg.keyboard.press('Tab'); n += 1
            pg.keyboard.press('Escape'); pg.wait_for_timeout(350)
            check(f'kbd {w}px: Escape closes the toast and returns focus to the amount field (not <body>)',
                  pg.evaluate("document.getElementById('toast').hidden") and pg.evaluate(AE) == 'pay-amount', pg.evaluate(AE))
            pg.focus('#pay-amount'); pg.keyboard.type('1'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
            n = 0
            while pg.evaluate(AE) != 'toast-undo' and n < 30: pg.keyboard.press('Tab'); n += 1
            pg.keyboard.press('Enter'); pg.wait_for_timeout(350)
            check(f'kbd {w}px: Undo from the keyboard takes the payment back and returns focus to the amount field',
                  pg.evaluate(AE) == 'pay-amount' and abs(pg.evaluate(owed_ethan) - (before - 5)) < 0.001, (pg.evaluate(AE), pg.evaluate(owed_ethan)))
            pg.focus('#pay-amount'); pg.keyboard.type(str(pg.evaluate(owed_ethan))); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
            check(f'kbd {w}px: paying in full removes the form and moves focus to the page heading, not <body>',
                  pg.locator('#payForm').count() == 0 and pg.evaluate("document.activeElement.tagName") == 'H1', pg.evaluate("document.activeElement.tagName"))
            pg.evaluate("location.hash = 'invoices/c_maya'"); pg.wait_for_timeout(300); pg.focus('#invPick'); pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(300)
            check(f'kbd {w}px: arrowing the student picker switches invoice and keeps focus on the picker',
                  pg.evaluate("location.hash") != '#invoices/c_maya' and pg.evaluate(AE) == 'invPick', (pg.evaluate("location.hash"), pg.evaluate(AE)))
            pg.evaluate("location.hash = 'summary'"); pg.wait_for_timeout(300)
            h0 = pg.evaluate("location.hash"); pg.focus('#sumMonth'); pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(300)
            if pg.evaluate("location.hash") == h0: pg.keyboard.press('ArrowUp'); pg.wait_for_timeout(300)
            check(f'kbd {w}px: arrowing the Summary month picker switches month and keeps focus on the picker',
                  pg.evaluate("location.hash") != h0 and pg.evaluate("location.hash").startswith('#summary/') and pg.evaluate(AE) == 'sumMonth', (h0, pg.evaluate("location.hash"), pg.evaluate(AE)))
            h1 = pg.evaluate("location.hash"); pg.focus('#sumWho'); pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(300)
            check(f'kbd {w}px: arrowing the Summary student picker switches to a family statement and keeps focus on the picker',
                  pg.evaluate("location.hash") != h1 and pg.evaluate("location.hash").count('/') == 2 and pg.evaluate(AE) == 'sumWho', (h1, pg.evaluate("location.hash"), pg.evaluate(AE)))
            pg.keyboard.press('ArrowUp'); pg.wait_for_timeout(300)
            check(f'kbd {w}px: arrowing the Summary student picker back to All students keeps focus on the picker',
                  pg.evaluate("location.hash").count('/') == 1 and pg.evaluate(AE) == 'sumWho', (pg.evaluate("location.hash"), pg.evaluate(AE)))
            check(f'kbd {w}px: no console errors in the keyboard payment pass', not kb_console, kb_console)
            ctx.close()

        # layout + accessibility on every page, desktop and phone
        axe = AXE_PATH.read_text() if AXE_PATH.exists() else None
        for vp_name, vp in [('desk', {'width': 1280, 'height': 900}), ('mob', {'width': 390, 'height': 844})]:
            ctx = b.new_context(viewport=vp, bypass_csp=True)  # CSP blocks injecting axe otherwise
            pg = ctx.new_page(); pg.on('dialog', lambda d: d.accept())
            pg.goto(URL); pg.wait_for_timeout(300); pg.click('#app [data-act=demo]'); pg.wait_for_timeout(300)
            for i, r in enumerate(ROUTES):
                go(pg, r); pg.wait_for_timeout(150)
                if vp_name == 'desk' and i == 0:
                    nav_over = pg.evaluate("(() => { const n = document.getElementById('nav'); return n.scrollWidth - n.clientWidth; })()")
                    check('desk: every nav item fits at 1280px (no clipped links)', nav_over <= 0, f'{nav_over}px')
                over = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
                check(f'{vp_name} {r}: no horizontal overflow', over <= 0, f'{over}px')
                if SHOTS:
                    pg.evaluate("document.getElementById('toast').classList.remove('show')"); pg.wait_for_timeout(250)
                    pg.screenshot(path=f'{SHOTS}/{vp_name}-{i+1:02d}-{r}.png', full_page=True)
                if axe and vp_name == 'desk':
                    if i == 0: pg.add_script_tag(content=axe)
                    v = pg.evaluate("async () => (await axe.run(document, {runOnly: ['wcag2a','wcag2aa','wcag21aa','best-practice']})).violations.map(v => v.id + '(' + v.impact + ') ' + v.nodes.slice(0,2).map(n => n.target.join(' ')).join(' | '))")
                    check(f'axe {r}: no WCAG 2.1 AA / best-practice violations', not v, v)
                if axe and vp_name == 'mob':
                    if i == 0: pg.add_script_tag(content=axe)
                    v = pg.evaluate("async () => (await axe.run(document, {runOnly: ['wcag2a','wcag2aa','wcag21aa','wcag22aa','best-practice']})).violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id + '(' + v.impact + ') ' + v.nodes.slice(0,2).map(n => n.target.join(' ')).join(' | '))")
                    check(f'axe mob {r} at 390px: no serious or critical violations', not v, v)
            if vp_name == 'desk':
                # print stylesheet: invoice and sponsor log hide the app chrome
                pg.emulate_media(media='print')
                for r in ['invoices', 'hours', 'summary']:
                    go(pg, r); pg.wait_for_timeout(150)
                    check(f'print {r}: nav and buttons hidden', not pg.is_visible('.topbar') and not pg.is_visible('.toolbar'))
                    if SHOTS: pg.screenshot(path=f'{SHOTS}/print-{r}.png', full_page=True)
                check('print hours: sponsor signature line shown', pg.is_visible('.sign'))
                pg.emulate_media(media='screen')
            ctx.close()
        b.close()
finally:
    srv.terminate()

print(f'\n{len(results)} passed, {len(failures)} failed')
sys.exit(1 if failures else 0)
