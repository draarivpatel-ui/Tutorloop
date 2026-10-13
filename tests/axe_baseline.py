"""axe-core baseline guard for TutorLoop (added Oct 12, 2026 after an accessibility audit; tests only, no app change).
Runs axe-core 4.14.0 with the WCAG 2.0/2.1/2.2 A+AA and best-practice tags on the main views at 360 and 1280 px.
The 2.2 tag also switches on `target-size` (WCAG 2.5.8), which axe leaves off by default and the other axe suites
here do not run. It fails only on a NEW serious or critical violation: a (rule, element) pair not listed in BASELINE.
Moderate/minor results are printed, not failed (tests/e2e.py already requires 0 violations of every impact
for the WCAG 2.1 rule set).
Run: python3 tests/axe_baseline.py   (serves this folder from a /Tutorloop/ sub-path like production; optional CHROMIUM_PATH, AXE_JS)"""
import os, re, sys, pathlib, socket, subprocess, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
# Serious/critical violations accepted at the Oct 12, 2026 audit: (rule id, regex on the axe target, why). The audit found none.
# (At 360 px axe reports `skip-link` (moderate) for nav links scrolled out of view; moderate, so printed, not failed.)
BASELINE = []

# ---- shared core (same in all four repos) ----
TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
AXE_VERSION = '4.14.0'
PATHS = [os.environ.get('AXE_JS', ''), str(ROOT / 'node_modules/axe-core/axe.min.js')]
AXE = next((open(p).read() for p in PATHS if p and os.path.exists(p)), None) or \
    urllib.request.urlopen(f'https://cdn.jsdelivr.net/npm/axe-core@{AXE_VERSION}/axe.min.js', timeout=30).read().decode()
passed = failed = 0
def check(name, cond, info=''):
    global passed, failed
    if cond: passed += 1; print('  ok   ' + name)
    else: failed += 1; print('  FAIL ' + name + ('  -> ' + str(info) if info else ''))
def known(rule, target):
    return any(rule == r and re.search(pat, target) for r, pat, _why in BASELINE)
def axe_new_serious(pg, tag):
    if not pg.evaluate('!!window.axe'): pg.add_script_tag(content=AXE)
    res = pg.evaluate("""async(tags)=>{const r=await axe.run(document,{runOnly:{type:'tag',values:tags},resultTypes:['violations']});
      return {v:axe.version,list:r.violations.flatMap(x=>x.nodes.map(n=>({id:x.id,impact:n.impact||x.impact,t:n.target.join(' ')})))}}""", TAGS)
    new = [x for x in res['list'] if x['impact'] in ('serious', 'critical') and not known(x['id'], x['t'])]
    other = sorted({f"{x['id']}({x['impact']})" for x in res['list'] if x not in new})
    if other: print(f'  info [{tag}] baseline/lower-impact, not failed: {other}')
    check(f'[{tag}] axe {res["v"]} WCAG 2.2 AA + best-practice: no new serious/critical violation', not new,
          [f"{x['id']}({x['impact']}) {x['t']}" for x in new][:6])
ROUTES = ['dashboard', 'log', 'students', 'reports', 'invoices', 'hours', 'summary', 'settings', 'about']
s = socket.socket(); s.bind(('127.0.0.1', 0)); PORT = s.getsockname()[1]; s.close()
SITE = pathlib.Path(tempfile.mkdtemp()); (SITE / 'Tutorloop').symlink_to(ROOT, target_is_directory=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=SITE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8); URL = f'http://127.0.0.1:{PORT}/Tutorloop/'
try:
    with sync_playwright() as p:
        kw = {'executable_path': os.environ.get('CHROMIUM_PATH') or os.environ.get('CHROME_PATH')} if (os.environ.get('CHROMIUM_PATH') or os.environ.get('CHROME_PATH')) else {}
        b = p.chromium.launch(**kw)
        for vw in (360, 1280):
            ctx = b.new_context(viewport={'width': vw, 'height': 800}, bypass_csp=True); pg = ctx.new_page()  # CSP blocks injecting axe otherwise
            pg.on('dialog', lambda d: d.accept())
            pg.goto(URL); pg.evaluate('localStorage.clear()'); pg.goto(URL); pg.wait_for_timeout(300)
            axe_new_serious(pg, f'{vw} first run')
            pg.click('#app [data-act=demo]'); pg.wait_for_timeout(300)
            for r in ROUTES:
                pg.evaluate(f"location.hash = '{r}'"); pg.wait_for_timeout(200)
                axe_new_serious(pg, f'{vw} demo #{r}')
            ctx.close()
        b.close()
finally:
    srv.terminate()
print(f'\n{passed} passed, {failed} failed')
sys.exit(1 if failed else 0)
