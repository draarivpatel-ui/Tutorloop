"""
Time-zone date boundaries in a real headless Chromium (Playwright for Python).

  python tests/tz_test.py

A tutor logs a session at 11:30 PM. The browser's clock is UTC underneath, and the UTC date is
already tomorrow in the Americas (and still yesterday in Kiribati). TutorLoop must use the tutor's
LOCAL calendar day everywhere: the date a quick-start session is saved under, the date picker's
"no later than tomorrow" limit, the invoice date, and which month the dashboard and the monthly
summary call "this month". Each case fixes the browser clock to an instant (page.clock) and the
browser time zone (timezone_id), then reads what the app did.
"""
import datetime as dt, json, os, pathlib, socket, subprocess, sys, tempfile, time
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
results, failures = [], []
def check(name, cond, detail=''):
    (results if cond else failures).append(name)
    print(('✓ ' if cond else '✗ ') + name + ('' if cond else f'  ->  {detail}'))

# (zone, UTC instant, the tutor's local date at that instant, why it matters)
CASES = [
    ('America/Chicago',   '2026-10-12T04:30:00Z', '2026-10-11', '11:30 PM CDT: UTC is already the 12th'),
    ('America/Chicago',   '2026-10-12T05:15:00Z', '2026-10-12', '12:15 AM CDT: a new local day'),
    ('America/Chicago',   '2026-11-01T04:30:00Z', '2026-10-31', '11:30 PM on Oct 31: UTC is already November'),
    ('America/New_York',  '2026-11-02T04:59:00Z', '2026-11-01', '11:59 PM EST on the day clocks fall back'),
    ('America/New_York',  '2026-03-08T07:30:00Z', '2026-03-08', '3:30 AM EDT just after clocks spring forward'),
    ('Pacific/Pago_Pago', '2026-10-12T10:30:00Z', '2026-10-11', 'UTC-11: still the 11th at 11:30 PM'),
    ('Pacific/Kiritimati','2026-10-11T10:30:00Z', '2026-10-12', 'UTC+14: already the 12th'),
    ('Asia/Kolkata',      '2026-12-31T18:20:00Z', '2026-12-31', 'UTC+5:30 on New Year\'s Eve, 11:50 PM'),
    ('Asia/Kolkata',      '2026-12-31T18:40:00Z', '2027-01-01', 'UTC+5:30, 12:10 AM: a new year locally'),
    ('Australia/Lord_Howe','2026-10-04T13:15:00Z', '2026-10-05', 'UTC+11 (half-hour DST zone) after its DST switch'),
]

def fmt(d):  # the app's fmtDate(d, true): "Oct 11, 2026"
    y, m, day = map(int, d.split('-'))
    return dt.date(y, m, day).strftime('%b ') + str(day) + dt.date(y, m, day).strftime(', %Y')

s = socket.socket(); s.bind(('127.0.0.1', 0)); PORT = s.getsockname()[1]; s.close()
SITE = pathlib.Path(tempfile.mkdtemp())
(SITE / 'Tutorloop').symlink_to(ROOT, target_is_directory=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=SITE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
URL = f'http://127.0.0.1:{PORT}/Tutorloop/'

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None)
        for zone, instant, local, why in CASES:
            ctx = b.new_context(viewport={'width': 1280, 'height': 900}, timezone_id=zone, service_workers='block')
            pg = ctx.new_page()
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.clock.set_fixed_time(dt.datetime.fromisoformat(instant.replace('Z', '+00:00')))
            pg.goto(URL); pg.wait_for_timeout(300)
            tag = f'{zone} {why}'
            pg.fill('#q-name', 'Riya Shah'); pg.fill('#q-rate', '30'); pg.fill('#q-minutes', '60')
            pg.click('#quickForm button[type=submit]'); pg.wait_for_timeout(250)
            data = json.loads(pg.evaluate("localStorage.getItem('tutorloop.v1')"))
            saved = data['sessions'][0]['date'] if data['sessions'] else None
            check(f'{tag}: quick start saves the session on the local day {local}', saved == local, saved)
            pg.evaluate("location.hash = 'log'"); pg.wait_for_timeout(200)
            mx = pg.get_attribute('#f-date', 'max'); val = pg.input_value('#f-date')
            y, m, d = map(int, local.split('-')); tomorrow = (dt.date(y, m, d) + dt.timedelta(days=1)).isoformat()
            check(f'{tag}: the Log form defaults to today and allows up to tomorrow', val == local and mx == tomorrow, f'{val} max {mx}')
            cid = data['clients'][0]['id']
            pg.evaluate(f"location.hash = 'invoices/{cid}'"); pg.wait_for_timeout(200)
            inv = pg.inner_text('#app')
            check(f'{tag}: the invoice is dated {fmt(local)} and numbered with that day', fmt(local) in inv and 'INV-' + local.replace('-', '') in inv, inv[:300])
            pg.evaluate("location.hash = 'summary'"); pg.wait_for_timeout(200)
            month = pg.input_value('#sumMonth')
            check(f'{tag}: "this month" on the summary is {local[:7]} and includes the session', month == local[:7] and '$30.00' in pg.inner_text('#app'), month)
            check(f'{tag}: no page errors', not errs, errs)
            ctx.close()
        b.close()
finally:
    srv.terminate()

print(f'\n{len(results)} passed, {len(failures)} failed')
sys.exit(1 if failures else 0)
