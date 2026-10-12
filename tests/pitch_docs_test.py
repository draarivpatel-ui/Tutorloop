#!/usr/bin/env python3
"""Pitch-docs check: every number and on-screen label that demo-script.md and pitch-outline.md tell
Aariv to say or click must be what the running app actually shows. If the app or the docs change,
this fails until the two agree again.

Run:  python3 tests/pitch_docs_test.py          (serves this folder from a /Tutorloop/ sub-path, like production)
      python3 tests/pitch_docs_test.py --live   (loads https://aariv.me/Tutorloop/)

Read-only and black-box at 1280 px, like a judge with the sample data. Needs pip playwright + /usr/bin/chromium (or CHROMIUM_PATH).
Added Oct 11, 2026 after a strict-judge read found two doc lines the app didn't back: the part-payment beat quoted
"$10.00 of $25.00 paid" for Ethan (the app says "$10.00 of $90.00 paid"), and the pitch's go-to-market list did not
match the four steps the Why TutorLoop page shows.
"""
import os, re, sys, shutil, socket, subprocess, tempfile, time
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIVE = '--live' in sys.argv
results, fails = [], []
DEMO = open(os.path.join(HERE, 'demo-script.md'), encoding='utf-8').read()
PITCH = open(os.path.join(HERE, 'pitch-outline.md'), encoding='utf-8').read()

def check(name, cond, info=''):
    results.append(name)
    print(('ok - ' if cond else 'FAIL - ') + name + ('' if cond else '  ' + str(info)[:600]))
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
        r = urllib.request.urlopen(urllib.request.Request(route.request.url, headers={'User-Agent': 'Mozilla/5.0 (TutorLoop pitch-docs check)'}), timeout=30)
        route.fulfill(status=r.status, body=r.read(), headers={'Content-Type': r.headers.get('Content-Type', 'application/octet-stream')})
    except urllib.error.HTTPError as e: route.fulfill(status=e.code, body=e.read())
    except Exception: route.abort()

def go(pg, h): pg.evaluate(f"location.hash = '{h}'"); pg.wait_for_timeout(250)
def app(pg): return re.sub(r'\s+', ' ', pg.inner_text('#app'))

exe = os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if os.path.exists('/usr/bin/chromium') else None)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=exe)
        ctx = b.new_context(viewport={'width': 1280, 'height': 900})
        if LIVE: ctx.route('**/*', proxy)
        pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        pg.on('dialog', lambda d: d.accept())
        pg.goto(URL); pg.wait_for_timeout(600)

        # Shot 3: the first-run quick start
        t = app(pg)
        check('shot 3: empty app shows "Try it with your own student" with a 45 min chip and "Save and see what TutorLoop makes"',
              'Try it with your own student' in t and pg.get_by_role('button', name='45 min').count() == 1
              and pg.get_by_role('button', name='Save and see what TutorLoop makes').count() == 1, t[:300])
        pg.fill('#q-name', 'Riya'); pg.get_by_role('button', name='45 min').click()
        pg.fill('#q-topics', 'fractions'); pg.fill('#q-notes', 'Improved on fractions')
        pg.get_by_role('button', name='Save and see what TutorLoop makes').click(); pg.wait_for_timeout(500)
        t = app(pg)
        check('shot 3: after saving, a drafted parent update and an invoice amount appear', 'Parent update (draft)' in t and re.search(r'Invoice for \$\d', t), t[:500])

        # Before-you-record step 4 + shot 4: sample-data numbers
        go(pg, 'settings'); pg.locator('[data-act=demo]').first.click(); pg.wait_for_timeout(600)
        go(pg, 'dashboard'); t = app(pg)
        check('sample bar says "You\'re exploring sample data" with "Start fresh with my own students"',
              "You're exploring sample data" in t and 'Start fresh with my own students' in t, t[:300])
        check('demo-script numbers: $115 unpaid, Ethan Brooks $90 for 2 sessions, Maya Chen $25, 2.25 of a 10-hour goal',
              re.search(r'UNPAID \(ALL TIME\) \$115\.00', t, re.I) and re.search(r'Ethan Brooks 2 unpaid sessions[^$]*\$90\.00', t)
              and re.search(r'Maya Chen 1 unpaid session[^$]*\$25\.00', t) and re.search(r'SERVICE HOURS 2\.25 23% of your 10-hour goal', t, re.I), t[:900])
        for doc, label in ((DEMO, 'demo-script'),):
            check(label + ' quotes the same sample numbers', all(x in doc for x in ('$115 unpaid', 'Ethan Brooks owes $90', 'Maya Chen owes $25', '2.25 of 10 service hours')))
        href = pg.locator('#app a', has_text='Remind').first.get_attribute('href') or ''
        import urllib.parse; body = urllib.parse.unquote(href)
        # sample dates move with today, so count the dated session lines instead of naming the dates
        dated = re.findall(r'^• [A-Z][a-z]{2} \d{1,2}: 90 min', body, re.M)
        check('shot 4: Remind writes an itemised reminder listing both of Ethan\'s session dates', href.startswith('mailto:') and len(dated) == 2 and '$90.00 for 2 sessions' in body, body[:300])

        # Shot 5: 60 min chip + live amount preview
        go(pg, 'log'); t = app(pg)
        check('shot 5: log page has a 60 min chip and a live amount preview', pg.get_by_role('button', name='60 min').count() == 1 and re.search(r'Amount: \$\d', t), t[:300])

        # Shot 6: parent update for Maya
        go(pg, 'reports')
        sel = pg.locator('#app select').first
        maya = sel.evaluate("s => [...s.options].find(o => /Maya/.test(o.text)).value"); sel.select_option(maya)
        check('shot 6: the button is "Generate update" and the doc says so', pg.get_by_role('button', name='Generate update').count() == 1 and 'Generate update' in DEMO)
        pg.get_by_role('button', name='Generate update').click(); pg.wait_for_timeout(400)
        rep = pg.evaluate("(document.getElementById('reportOut') || {}).value || ''")
        check('shot 6: Maya\'s update has "Overall" (turning around) and "Highlight" (word problems) lines',
              re.search(r'Overall:.*turning around', rep) and re.search(r'Highlight:.*word problems', rep), rep[:500])

        # Shot 8: service hours
        go(pg, 'hours'); t = app(pg)
        check('shot 8: Service hours has CSV export and a print log for the sponsor', 'Export hours (CSV)' in t and 'Print log for sponsor' in t, t[:300])

        # Shot 9 + before-you-record: free-plan limit
        go(pg, 'students'); t = app(pg)
        paused = pg.evaluate("(() => { const b = [...document.querySelectorAll('#clientForm button[type=submit]')][0]; return !!b && b.matches(':disabled'); })()")
        check('shot 9: Students says "Free plan: 3 of 3" and the Add-student form is paused with a "see plans" link',
              'Free plan: 3 of 3 active students' in t and pg.locator('#limitNote a', has_text='see plans').count() == 1 and paused, t[:400])
        check('demo-script describes the paused Add-student form (not an upgrade wall)', 'upgrade wall' not in DEMO and 'Add-student form is paused' in DEMO)
        pg.locator('#limitNote a', has_text='see plans').click(); pg.wait_for_timeout(400); t = app(pg)
        m = re.search(r'Pro is \$4 a month, about (\d+) minutes of tutoring', t)
        check('shot 9: Your usage prices Pro as "about 9 minutes of tutoring" (doc says the same)', 'Your usage' in t and m and m.group(1) == '9' and 'about 9 minutes of tutoring' in DEMO, m and m.group(0))
        check('shot 9: plans say checkout is a demo ("Demo only ... no payment is taken")', 'no payment is taken' in t)

        # Part-payment beat
        go(pg, 'invoices')
        who = pg.locator('#app select').first.evaluate("s => s.options[s.selectedIndex].text")
        pg.get_by_label(re.compile('Amount received')).fill('10'); pg.get_by_role('button', name='Record payment').click(); pg.wait_for_timeout(500)
        go(pg, 'dashboard'); t = app(pg)
        check('part-payment beat: Invoices opens on Ethan; paying $10 shows "$80.00" owed and "$10.00 of $90.00 paid"',
              who.startswith('Ethan') and re.search(r'Ethan Brooks[^$]*\$80\.00 \$10\.00 of \$90\.00 paid', t), (who, t[t.find('Who owes you'):][:300]))
        check('demo-script quotes "$10.00 of $90.00 paid" (not the old "$10.00 of $25.00 paid")', '$10.00 of $90.00 paid' in DEMO and '$10.00 of $25.00 paid' not in DEMO)
        go(pg, 'summary')
        s2 = pg.locator('#app select').nth(1); s2.select_option(s2.evaluate("s => [...s.options].find(o => /Ethan/.test(o.text)).value")); pg.wait_for_timeout(300)
        check('part-payment beat: Ethan\'s family statement lists "Payments received in <month>"', re.search(r'Payments received in \w+ \d{4}', app(pg)))

        # Shot 13 + pitch sections 3-5: the Why TutorLoop page
        go(pg, 'about'); t = app(pg)
        check('shot 13 / pitch 4: fee table keeps $3.56 of Pro and $95.14 of Club; annual Pro $36.00/yr row',
              '$3.56 (89%)' in t and '$95.14 (96%)' in t and 'Pro (annual) $36.00/yr' in t.replace('\t', ' '), t[:200])
        check('pitch 4 quotes the same unit economics', '$3.56 kept per month (89%)' in PITCH and '$95.14 kept per year (96%)' in PITCH and '$3.56 of a Pro month' in DEMO)
        check('pitch 3: "$1.6 million" ceiling, 1,000 hours a chapter, 50 tutors per Club are on the page',
              'Ceiling, not a forecast' in t and '$1.6 million a year' in t and 'about 1,000 hours of service a year' in t and 'up to 50 tutors' in t)
        i = t.find('Break-even, in customers'); be = t[i:i + 900].replace('\t', ' ')
        check('pitch 4 path to sustainability: break-even on the page ($5.00 a month sync -> 2 monthly Pro, 2 annual Pro, 1 Club covers 19 months) and the same numbers in the pitch',
              i >= 0 and '$5.00 a month' in be and be.count('2 tutors') == 2 and '1 chapter covers 19 months' in be and
              all(x in PITCH for x in ('$5.00 a month', '**2 monthly Pro tutors**', '**2 annual Pro tutors**', '**1 Club chapter**', '19 months')), be[:400])
        i = t.find('Go-to-market, in order'); gtm = t[i:i + 900]
        app_steps = [s for s in ('Seed:', 'Sponsor wedge:', 'Built-in word of mouth:', 'Annual Pro test:') if s in gtm]
        pos = [gtm.find(s) for s in app_steps]
        check('app: go-to-market shows Seed, Sponsor wedge, Built-in word of mouth, Annual Pro test, in that order', len(app_steps) == 4 and pos == sorted(pos), gtm[:400])
        sec5 = PITCH[PITCH.index('## 5. Go-to-market'):PITCH.index('## 6.')]
        doc_steps = re.findall(r'^\d\. \*\*([^*:(]+?)(?: \([^)]*\))?:\*\*', sec5, re.M)
        check('pitch 5: its first four steps are the app\'s four, same order', doc_steps[:4] == ['Seed', 'Sponsor wedge', 'Built-in word of mouth', 'Annual Pro test'], doc_steps)
        check('pitch 6: the page says "No paying customers yet, and no usage numbers to claim."', 'No paying customers yet, and no usage numbers to claim.' in t and 'No paying customers yet, and no usage numbers to claim.' in PITCH)
        check('pitch 8: TutorBird $16.95 and Teachworks $16.49 + $0.32 match the page', '$16.95/mo + $4.95' in t and '$16.49/mo + $0.32' in t and '$16.95/mo + $4.95' in PITCH and '$16.49/mo + $0.32' in PITCH)
        check('no console or page errors on the demo path', not errs, errs)
        b.close()
finally:
    if srv: srv.terminate()

# Shot 10/12 + pitch 7: build claims read from the code
html = open(os.path.join(HERE, 'index.html'), encoding='utf-8').read()
check('shot 10: a strict CSP blocks inline scripts (script-src \'self\' only)', re.search(r"Content-Security-Policy\"[^>]*script-src 'self';", html) is not None)
src = open(os.path.join(HERE, 'tests', 'core.test.js'), encoding='utf-8').read()
check('shot 12 / pitch 7: a test runs 5,000 sessions across 50 students under 1.5 s', 'i < 5000' in src and "'c' + (i % 50)" in src and 'ms < 1500' in src)
print(f'\n{len(results)} checks, {len(fails)} failed')
sys.exit(1 if fails else 0)
