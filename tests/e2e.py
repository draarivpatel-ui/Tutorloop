"""
End-to-end test in a real headless Chromium (Playwright for Python).

  pip install playwright && python -m playwright install chromium
  python tests/e2e.py                 # run the checks
  SHOTS=out/ python tests/e2e.py      # also save desktop + mobile screenshots of every page

Checks real-browser behaviour that unit tests and jsdom can't: native form validation, the
service worker / offline reload, layout overflow on a phone, accessibility (axe-core, if
node_modules/axe-core is installed), keyboard focus, and that nothing logs a console error.
"""
import json, os, pathlib, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = os.environ.get('SHOTS')
AXE_PATH = ROOT / 'node_modules' / 'axe-core' / 'axe.min.js'
ROUTES = ['dashboard', 'log', 'students', 'reports', 'invoices', 'hours', 'settings']

results, failures = [], []
def check(name, cond, detail=''):
    (results if cond else failures).append(name + ('' if cond else f'  ->  {detail}'))
    print(('✓ ' if cond else '✗ ') + name + ('' if cond else f'  ->  {detail}'))

s = socket.socket(); s.bind(('127.0.0.1', 0)); PORT = s.getsockname()[1]; s.close()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
URL = f'http://127.0.0.1:{PORT}/'

def go(pg, route):
    pg.evaluate(f"location.hash = '{route}'"); pg.wait_for_timeout(150)

try:
    with sync_playwright() as p:
        b = p.chromium.launch()
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
        go(pg, 'students'); pg.fill('#c-name', 'Fourth Kid'); pg.click('#clientForm button[type=submit]'); pg.wait_for_timeout(100)
        check('free plan blocks a 4th active student', 'Free plan includes 3' in pg.inner_text('.form-errors'))
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

        # layout + accessibility on every page, desktop and phone
        axe = AXE_PATH.read_text() if AXE_PATH.exists() else None
        for vp_name, vp in [('desk', {'width': 1280, 'height': 900}), ('mob', {'width': 390, 'height': 844})]:
            ctx = b.new_context(viewport=vp, bypass_csp=True)  # CSP blocks injecting axe otherwise
            pg = ctx.new_page(); pg.on('dialog', lambda d: d.accept())
            pg.goto(URL); pg.wait_for_timeout(300); pg.click('#app [data-act=demo]'); pg.wait_for_timeout(300)
            for i, r in enumerate(ROUTES):
                go(pg, r); pg.wait_for_timeout(150)
                over = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
                check(f'{vp_name} {r}: no horizontal overflow', over <= 0, f'{over}px')
                if SHOTS:
                    pg.evaluate("document.getElementById('toast').classList.remove('show')"); pg.wait_for_timeout(250)
                    pg.screenshot(path=f'{SHOTS}/{vp_name}-{i+1:02d}-{r}.png', full_page=True)
                if axe and vp_name == 'desk':
                    if i == 0: pg.add_script_tag(content=axe)
                    v = pg.evaluate("async () => (await axe.run(document, {runOnly: ['wcag2a','wcag2aa','wcag21aa','best-practice']})).violations.map(v => v.id + '(' + v.impact + ') ' + v.nodes.slice(0,2).map(n => n.target.join(' ')).join(' | '))")
                    check(f'axe {r}: no WCAG 2.1 AA / best-practice violations', not v, v)
            if vp_name == 'desk':
                # print stylesheet: invoice and sponsor log hide the app chrome
                pg.emulate_media(media='print')
                for r in ['invoices', 'hours']:
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
