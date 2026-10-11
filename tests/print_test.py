"""
Print check in real headless Chromium: every printable page saved as a US Letter PDF, the way
"Print / Save PDF" does it (print media, default margins, @page 16mm).

  python tests/print_test.py              (CHROMIUM_PATH=/usr/bin/chromium if Playwright has no browser)
  PDFS=out/ python tests/print_test.py    (also keep the PDFs)

TutorLoop is English-only, so each document is checked in English. Uses pdfinfo/pdftotext (poppler)
when present to count pages and read the text; falls back to counting /Type /Page objects.

For each document (sample data): invoice for each student, a long invoice (30 sessions), the
part-paid invoice, the monthly summary (all students and one family statement) and the service-hour log:
  - fits the expected number of Letter pages (invoice / statement: 1; long invoice: <= 2)
  - no app chrome in the PDF (nav, buttons, "Record a payment", toasts, sample-data bar)
  - the money that matters is printed (total owed / amount, payment line, signature line where needed)
  - nothing wider than the printable width (no clipped table columns)
"""
import os, pathlib, re, shutil, socket, subprocess, sys, tempfile, time
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(os.environ.get('PDFS') or tempfile.mkdtemp())
OUT.mkdir(parents=True, exist_ok=True)
results, failures = [], []
def check(name, cond, detail=''):
    (results if cond else failures).append(name)
    print(('✓ ' if cond else '✗ ') + name + ('' if cond else f'  ->  {str(detail)[:400]}'))

def pdf_pages(path):
    if shutil.which('pdfinfo'):
        m = re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo', str(path)], capture_output=True, text=True).stdout)
        return int(m.group(1)) if m else -1
    return len(re.findall(rb'/Type\s*/Page[^s]', path.read_bytes()))

def pdf_text(path):
    if not shutil.which('pdftotext'): return None
    return subprocess.run(['pdftotext', '-layout', str(path), '-'], capture_output=True, text=True).stdout

CHROME = ['Record a payment', 'Print / Save PDF', 'Load sample data', "You're exploring sample data", 'Send reminder', 'Skip to content', 'Undo']

s = socket.socket(); s.bind(('127.0.0.1', 0)); PORT = s.getsockname()[1]; s.close()
SITE = pathlib.Path(tempfile.mkdtemp()); (SITE / 'Tutorloop').symlink_to(ROOT, target_is_directory=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=SITE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
URL = f'http://127.0.0.1:{PORT}/Tutorloop/'

def go(pg, route):
    pg.evaluate(f"location.hash = '{route}'"); pg.wait_for_timeout(200)

def doc(pg, name, max_pages, must=(), may_overflow_sel=None):
    """Print the current page to Letter PDF and run the common checks."""
    pg.emulate_media(media='print')
    wide = pg.evaluate("""() => { const W = document.documentElement.clientWidth; const out = [];
        for (const el of document.querySelectorAll('#app *')) { const r = el.getBoundingClientRect();
          if (r.width && getComputedStyle(el).display !== 'none' && r.right > W + 1) out.push(el.tagName + '.' + el.className + ' ' + Math.round(r.right)); }
        return out.slice(0, 5); }""")
    path = OUT / f'{name}.pdf'
    pg.pdf(path=str(path), format='Letter', print_background=False, prefer_css_page_size=True)  # still print media
    pg.emulate_media(media='screen')
    n = pdf_pages(path); txt = pdf_text(path)
    check(f'{name}: {n} Letter page(s), at most {max_pages}', 1 <= n <= max_pages, n)
    check(f'{name}: nothing wider than the printable page', not wide, wide)
    if txt is not None:
        leaked = [c for c in CHROME if c in txt]
        check(f'{name}: no app chrome printed (buttons, nav, sample bar)', not leaked, leaked)
        missing = [m for m in must if (m.search(txt) is None if hasattr(m, 'search') else m not in txt)]
        check(f'{name}: prints ' + ', '.join(getattr(m, 'pattern', m) for m in must), not missing, [getattr(m, 'pattern', m) for m in missing] + [txt[:300]])
    return txt

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if os.path.exists('/usr/bin/chromium') else None))
        ctx = b.new_context(viewport={'width': 816, 'height': 1056}, service_workers='block')
        pg = ctx.new_page(); errors = []
        pg.on('pageerror', lambda e: errors.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
        pg.on('dialog', lambda d: d.accept())
        pg.goto(URL); pg.wait_for_timeout(400)
        pg.click('[data-act=demo] >> nth=0'); pg.wait_for_timeout(400)
        st = pg.evaluate("JSON.parse(localStorage.getItem('tutorloop.v1'))")
        clients = [c for c in st['clients'] if not c.get('archived')]
        check('sample data loaded (3+ students)', len(clients) >= 3, len(clients))
        money = re.compile(r'\$\d[\d,]*\.\d\d')
        printed_any = 0
        for c in clients:
            go(pg, f"invoices/{c['id']}")
            if pg.locator('[data-act=print]:not([disabled])').count() == 0: continue
            printed_any += 1
            slug = re.sub(r'\W+', '-', c['name'].lower()).strip('-')
            doc(pg, f'invoice-{slug}', 1, must=(c['name'], money, re.compile(r'(?i)total|amount due|balance')))
        check('at least one sample invoice was printable', printed_any >= 1, printed_any)

        # Long invoice: 30 unpaid sessions for one student -> must stay readable on at most 2 pages, total on the last page.
        c0 = clients[0]
        pg.evaluate("""cid => { const k = 'tutorloop.v1'; const s = JSON.parse(localStorage.getItem(k));
            const base = s.sessions.find(x => x.clientId === cid) || s.sessions[0];
            for (let i = 0; i < 30; i++) { const d = new Date(Date.now() - (i + 1) * 864e5).toISOString().slice(0, 10);
              s.sessions.push(Object.assign({}, base, {id: 'long' + i, clientId: cid, date: d, paid: false, topics: 'Long topic name number ' + i + ' quadratic equations and word problems'})); }
            localStorage.setItem(k, JSON.stringify(s)); }""", c0['id'])
        pg.reload(); pg.wait_for_timeout(400)
        go(pg, f"invoices/{c0['id']}")
        txt = doc(pg, 'invoice-long-30-sessions', 2, must=(c0['name'], re.compile(r'(?i)total')))
        if txt is not None:
            check('long invoice: the table header repeats or the total lands after the last row', txt.rfind('Total') > txt.rfind('Long topic name number'), '')

        # Part-paid invoice: record a part payment through the real form, then print.
        go(pg, f"invoices/{c0['id']}")
        if pg.locator('#payAmount, [name=payAmount], input[id*=pay]').count():
            inp = pg.locator('#payAmount, [name=payAmount], input[id*=pay]').first
            inp.fill('10.00'); inp.press('Enter'); pg.wait_for_timeout(300)
            doc(pg, 'invoice-part-paid', 2, must=(c0['name'], re.compile(r'(?i)paid|payment')))

        # Monthly summary (all students) and a family statement.
        go(pg, 'summary'); doc(pg, 'summary-all-students', 2, must=(re.compile(r'(?i)summary|sessions'), money))
        go(pg, f"summary/{time.strftime('%Y-%m')}/{clients[1]['id']}")
        doc(pg, 'family-statement', 1, must=(clients[1]['name'], money))

        # Service-hour log for a sponsor (only if sample data has volunteer sessions).
        go(pg, 'hours')
        if pg.locator('[data-act=print]:not([disabled])').count():
            doc(pg, 'service-hours-log', 2, must=('Volunteer tutoring log', 'Sponsor signature'))
        check('no page errors or console errors while printing', not errors, errors)
        b.close()
finally:
    srv.terminate()
print(f'\n{len(results)} passed, {len(failures)} failed  (PDFs in {OUT})')
sys.exit(1 if failures else 0)
