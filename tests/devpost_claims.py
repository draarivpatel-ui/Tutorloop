#!/usr/bin/env python3
"""Devpost-claims check: does TutorLoop still do what its submitted Next Founders page
(https://devpost.com/software/tutorloop, frozen Oct 11, 2026) says?

Run:  python3 tests/devpost_claims.py          (serves this folder from a /Tutorloop/ sub-path, like production)
      python3 tests/devpost_claims.py --live   (loads https://aariv.me/Tutorloop/)

Black-box and read-only: it clicks through the app as a judge would at 1280 px and 390 px and checks each claim,
quoting the Devpost sentence it backs. Needs pip playwright + /usr/bin/chromium (or CHROMIUM_PATH).
"""
import os, re, sys, json, shutil, socket, subprocess, tempfile, time, urllib.parse
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIVE = '--live' in sys.argv
results, fails = [], []

def check(name, cond, info=''):
    results.append(name)
    print(('ok - ' if cond else 'FAIL - ') + name + ('' if cond else '  ' + str(info)[:700]))
    if not cond: fails.append(name)

srv = None
if LIVE:
    URL = 'https://aariv.me/Tutorloop/'
else:
    site = tempfile.mkdtemp(); shutil.copytree(HERE, os.path.join(site, 'Tutorloop'), ignore=shutil.ignore_patterns('node_modules', 'video', '*.zip', 'gallery'))
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=site, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8); URL = f'http://127.0.0.1:{port}/Tutorloop/'

def proxy(route):
    # Chromium in some sandboxes has no direct route out (ERR_INVALID_AUTH_CREDENTIALS): fetch live files from Python.
    import urllib.request, urllib.error
    try:
        r = urllib.request.urlopen(urllib.request.Request(route.request.url, headers={'User-Agent': 'Mozilla/5.0 (TutorLoop claims check)'}), timeout=30)
        route.fulfill(status=r.status, body=r.read(), headers={'Content-Type': r.headers.get('Content-Type', 'application/octet-stream')})
    except urllib.error.HTTPError as e: route.fulfill(status=e.code, body=e.read())
    except Exception: route.abort()

def new_ctx(b, **kw):
    ctx = b.new_context(**kw)
    if LIVE: ctx.route('**/*', proxy)
    return ctx

def go(pg, h): pg.evaluate(f"location.hash = '{h}'"); pg.wait_for_timeout(200)
def app(pg): return re.sub(r'\s+', ' ', pg.inner_text('#app'))
def saved(pg): return pg.evaluate("JSON.parse(localStorage.getItem('tutorloop.v1') || 'null')")

exe = os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if os.path.exists('/usr/bin/chromium') else None)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=exe)
        for vw, vh in ((1280, 900), (390, 844)):
            tag = f"{'live' if LIVE else 'local'} {vw}px"
            ctx = new_ctx(b, viewport={'width': vw, 'height': vh}, accept_downloads=True)
            pg = ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
            pg.on('dialog', lambda d: d.accept())
            pg.goto(URL); pg.wait_for_timeout(500)

            # "30-second first run": one form creates the student and the session; dashboard shows the parent update + invoice
            pg.fill('#q-name', 'Riya Shah'); pg.fill('#quickForm [name=topics]', 'fractions'); pg.fill('#quickForm [name=notes]', 'Improved on fractions')
            pg.click('#quickForm [data-min="45"]'); pg.click('#quickForm button[type=submit]'); pg.wait_for_timeout(300)
            st = saved(pg)
            check(tag + ' "30-second first run: one save creates the student and the session"', len(st['clients']) == 1 and len(st['sessions']) == 1, st)
            t = app(pg)
            check(tag + ' "...the dashboard immediately shows the drafted parent update, the invoice amount, and the next steps"',
                  pg.locator('.firstrun').count() == 1 and 'Parent update' in t and re.search(r'Invoice.*\$\d', t) is not None, t[:400])
            # "10-second session log": 30/45/60/90 chips + live amount preview
            go(pg, 'log')
            chips = pg.eval_on_selector_all('[data-act=setMinutes]', 'es => es.map(e => e.dataset.min)')
            pg.click('[data-act=setMinutes][data-min="90"]')
            check(tag + ' "10-second session log: minutes (30/45/60/90 chips) ... with a live amount preview"',
                  chips == ['30', '45', '60', '90'] and '$' in pg.inner_text('#amountPreview'), (chips, pg.inner_text('#amountPreview')))
            # sample data for the rest
            go(pg, 'settings'); pg.click('[data-act=demo]'); pg.wait_for_timeout(300); go(pg, 'dashboard')
            t = app(pg)
            check(tag + ' Dashboard: "earnings and collections this month, the unpaid balance, service hours toward your goal"',
                  all(k.lower() in t.lower() for k in ('Earned this month', 'Collected this month', 'Unpaid', 'Service hours')) and 'goal' in t, t[:400])
            check(tag + ' Dashboard: "a 6-month earnings chart"', pg.locator('canvas#chart').count() == 1 and 'last 6 months' in t, '')
            row = pg.locator('#app table.stack tbody tr').first
            check(tag + ' Dashboard: "Who owes you list with Invoice, Remind, and Mark paid buttons"',
                  'Who owes you' in t and row.locator('text=Invoice').count() == 1 and row.locator('text=Remind').count() == 1 and row.locator('text=Mark paid').count() == 1, t[:600])
            check(tag + ' Dashboard: "Quick log starts from your last session with each student"', 'Quick log' in t and pg.locator('a[href^="#log/for/"]').count() >= 1, '')
            # Reminder: "ends with how to pay in plain words ('You can pay with Venmo @handle.')"
            href = row.locator('text=Remind').get_attribute('href') or ''
            body = urllib.parse.unquote(href)
            check(tag + ' Remind: "polite, itemised reminder ... ending with how to pay (You can pay with Venmo @handle.)"',
                  href.startswith('mailto:') and 'You can pay with Venmo @' in body, body[:400])
            # Footer: off by default; on adds one plain line
            go(pg, 'settings')
            check(tag + ' "Optional Sent with TutorLoop footer: off by default"', not pg.is_checked('#p-referral'), '')
            # Parent updates
            go(pg, 'reports'); pg.wait_for_timeout(300); t = app(pg)
            check(tag + ' "Parent updates: ... progress email ... You edit it, then copy it or open it in your email app"',
                  pg.locator('[data-act=copyReport]').count() == 1 and pg.locator('#app a[href^="mailto:"]').count() >= 1 and pg.locator('#app textarea').count() >= 1, t[:300])
            # Invoices: print / PDF
            go(pg, 'invoices'); t = app(pg)
            check(tag + ' "Invoices: unpaid sessions roll into a clean invoice you can print or save as a PDF"', pg.locator('#app [data-act=print]').count() >= 1 and 'Total' in t, t[:300])
            # Service hours: goal, CSV export, printable log with a sponsor signature line
            go(pg, 'hours'); t = app(pg)
            check(tag + ' "Service hours: ... progress toward a goal, a CSV export, and a printable log with a sponsor signature line"',
                  pg.locator('#app [data-act=exportHours]').count() == 1 and pg.locator('#app .sign').count() >= 1 and 'goal' in t.lower(), t[:300])
            # Monthly summary: student statement or all students; print, copy, email
            go(pg, 'summary'); t = app(pg)
            opts = pg.eval_on_selector_all('#sumWho option', 'os => os.map(o => o.textContent)')
            check(tag + ' "Monthly summary: one student (statement for the family) or all students ... print, copy as text, or email"',
                  'All students' in opts and any('family statement' in o for o in opts) and pg.locator('[data-act=copySummary]').count() == 1
                  and pg.locator('#app [data-act=print]').count() >= 1, (opts, t[:200]))
            pg.select_option('#sumWho', index=1); pg.wait_for_timeout(300)
            check(tag + ' monthly family statement can be opened in email', pg.locator('#app a[href^="mailto:"]').count() >= 1, app(pg)[:200])
            # Private by design: JSON backup/restore, CSV export, undo, permanent delete
            go(pg, 'settings')
            check(tag + ' "JSON backup and restore, CSV export ... permanent delete"',
                  all(pg.locator(f'[data-act={a}]').count() == 1 for a in ('exportJson', 'importClick', 'exportSessions', 'reset')), '')
            go(pg, 'dashboard'); before = sum(1 for s in saved(pg)['sessions'] if not s.get('paid'))
            pg.locator('#app [data-act=markPaidAll]').first.click(); pg.wait_for_timeout(200)
            pg.click('.toast-undo'); pg.wait_for_timeout(200)
            after = sum(1 for s in saved(pg)['sessions'] if not s.get('paid'))
            check(tag + ' "undo on every action" (Mark paid -> Undo)', before == after and before > 0, (before, after))
            # Business model numbers (Why TutorLoop page)
            go(pg, 'about'); t = app(pg)
            for claim, needle in (('Free: up to 3 active students', '3 active students'), ('Pro, $4/month', '$4'), ('Club, $99/school year', '$99'),
                                  ('keeps $3.56 of a Pro month', '$3.56'), ('$95.14 of a Club year', '$95.14'),
                                  ("NHS's 17,000+ chapters", '17,000+'),
                                  ('Traction, honestly: none yet', 'No paying customers yet'), ('Plan upgrades in the app are a demo checkout', 'simulation')):
                check(f'{tag} pitch page: "{claim}"', needle in t, '')
            # Devpost: "Club alone is a ~$1.7M/year ceiling" (17,000 x $99 gross). The app states the ceiling net of Stripe fees
            # (17,000 x $95.14 kept = $1.6 million). Both are true; this checks the app still states a ceiling, not a forecast.
            check(tag + ' pitch page: Club ceiling stated as "not a forecast" ($1.6M kept; Devpost rounds the gross to ~$1.7M)', 'Ceiling, not a forecast' in t and '1.6 million' in t, '')
            go(pg, 'settings'); t = app(pg)
            check(tag + ' Plans: Free / Pro $4/month / Club $99/school year with roadmap items tagged', '$4' in t and '$99' in t and 'roadmap' in t, '')
            check(tag + ' no console or page errors on the judge path', not errs, errs)
            ctx.close()

        # "Works offline": the service worker serves a reload with no network (after the first visit).
        # Local only: the live files are byte-identical (checked with live_match.py after every push), and the sandbox proxy can't carry SW fetches.
        if not LIVE:
            ctx = b.new_context(); pg = ctx.new_page()
            pg.goto(URL); pg.wait_for_timeout(300)
            pg.evaluate("navigator.serviceWorker.ready"); pg.wait_for_timeout(1200)
            pg.reload(); pg.wait_for_timeout(500); ctx.set_offline(True)
            try: pg.reload(); pg.wait_for_timeout(500); off = pg.locator('#app h1').count() == 1
            except Exception as e: off = False
            check('"Works offline ... a service worker caches the app (after the first visit)"', off, '')
            ctx.set_offline(False)
            man = pg.evaluate("fetch('manifest.webmanifest').then(r => r.json())")
            check('"it installs to your home screen" (manifest with name, start_url, icons, display)', man.get('display') in ('standalone', 'minimal-ui') and man.get('icons') and man.get('start_url'), man)
        if not LIVE: ctx.close()
        b.close()
finally:
    if srv: srv.terminate()

# "A unit test runs stats, balances, the 6-month chart, and a report over 5,000 sessions ... 1.5 seconds"
src = open(os.path.join(HERE, 'tests', 'core.test.js')).read()
check('"A unit test runs ... over 5,000 sessions and 50 students and fails if it takes longer than 1.5 seconds"', '5000' in src.replace(',', '').replace('_', '') and '1500' in src, '')
print(f'\n{len(results)} checks, {len(fails)} failed')
sys.exit(1 if fails else 0)
