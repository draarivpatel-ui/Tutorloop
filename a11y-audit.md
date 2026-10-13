# TutorLoop accessibility and performance audit (Mon Oct 12, 2026, ~9:55–10:30 PM EDT)

Audit only. **No app code was changed**: TutorLoop is submitted to Next Founders and its behaviour is frozen. Fixes are queued in BACKLOG.md as "post-judging a11y fixes", NOT BEFORE the Next Founders winners announcement (Devpost: **Sat Oct 24, 2026, 9:00 AM EDT**, https://next-founders.devpost.com/details/dates).

## Result
**Serious (axe): 0 · Critical: 0.** The top finding was found by hand, not by axe:
- **T1 (serious):** the current page's nav link shows **no focus indicator**.
- **T2 (moderate):** on phones, the first Tab skips the skip link.

## How it was tested
- Target: live https://aariv.me/Tutorloop/. Local `index.html`, `js/app.js`, `js/core.js`, `styles.css` and `sw.js` are byte-identical to it. `js/allergens.js` and `js/units.js` differ but are not part of TutorLoop.
- Headless Chromium 155 + Playwright 1.63.0; axe-core **4.14.0** (pinned in this repo's `package-lock.json` too). Harness: `/workspace/work/a11y-audit-oct12/audit.py`; raw JSON in `results/Tutorloop.json` (Hark's workspace).
- Views: first run, then sample data on all 9 routes (dashboard, log, students, reports, invoices, hours, summary, settings, about). Each at 1280×900 and 360×740.
- Rule set: WCAG 2.0/2.1/2.2 A+AA + best-practice. This includes `target-size`, which axe leaves off by default.
- Keyboard pass, 360/320 px layout, pixel-measured contrast and Lighthouse 12.8.2 (mobile, 1 live run).

## Findings
| # | Severity | WCAG | Finding | Fix it needs |
|---|---|---|---|---|
| T1 | **Serious** (manual) | 2.4.7 Focus Visible, AA | The nav link for the current page (`nav a.active`, `aria-current="page"`, e.g. "Dashboard") looks the same focused and unfocused. `styles.css` line 33, `nav a.active { box-shadow: inset 0 -2px 0 var(--brand) }`, is more specific than line 18, `:focus-visible { box-shadow: var(--focus) }`, so the focus ring never shows on that link. Verified by computed style and screenshot. Every other link shows the 2-tone ring. | `nav a.active:focus-visible { box-shadow: var(--focus), inset 0 -2px 0 var(--brand); }`, or give focus an `outline` so it can't be overridden by `box-shadow`. |
| T2 | Moderate | 2.4.3 Focus Order; 2.4.1 Bypass Blocks | Below 720 px, `js/app.js` line 753 calls `act.scrollIntoView(...)` on the active nav link after each render. In Chromium this moves the sequential-focus starting point, so the **first Tab from a fresh load lands on "Log session"**. It skips the skip link, the TutorLoop brand and the current link. Verified at 360 px. Calling the same `scrollIntoView` at 1280 px reproduces it. Shift+Tab still reaches them. | Scroll the nav container itself (e.g. set `nav.scrollLeft` from the link's `offsetLeft`) instead of calling `element.scrollIntoView`. Then re-check that the first Tab hits "Skip to content". |
| T3 | Moderate per axe; low real impact | 2.4.1 (axe `skip-link` heuristic) | At 360 px, axe flags nav links scrolled out of the horizontally scrolling `#nav` (1–6 per page) as "skip links whose target doesn't exist". They are hash-router links (`#dashboard`…), not skip links, and they work. | No functional fix needed. Optional: once T2 is fixed, re-run axe to confirm. |
| T4 | Advisory | — | Plan badges on Settings & plans ("roadmap", "not on sale yet") are 11 px text at 360 px. | Optional: 12 px minimum. |

No other issues found:
- **axe:** 0 serious/critical in all 20 runs; 0 violations of any impact at 1280. The only `incomplete` is `label-content-name-mismatch` on the toast close button, which axe can't decide.
- **Contrast:** every axe-incomplete node (nav links partly under the bar at 360) passed when measured from pixels (lowest 7.43:1).
- **Keyboard:** 30 stops; no trap; nothing unreachable; ring `0 0 0 2px #fff, 0 0 0 4px #1d4f7a`.
- **360 / 320 px:** no sideways scroll, nothing past the right edge. The 1 px "textarea" on Summary is the intentional `sr-only` copy buffer (`aria-hidden`, `tabindex=-1`), not a finding.

## Performance (Lighthouse mobile, live, 1 run)
Performance **85** (lowest of the four) · Accessibility **100** · Best practices **100** · SEO **100**.
FCP 1.2 s · LCP 1.9 s · **TBT 560 ms** · CLS 0.017 · Speed Index 1.8 s · TTI 2.1 s · Max potential FID 280 ms · 117 KiB transferred.

| # | Severity | Finding | Fix it needs |
|---|---|---|---|
| P1 | Moderate (perf) | TBT 560 ms. `js/app.js` is one large script, with ~20 KiB of it unused on first load; a forced reflow was also flagged. | Split rarely used views (Settings & plans, Why TutorLoop, print builders) into lazily imported modules; batch layout reads before writes in the render path. |
| P2 | Minor | JS not minified (~8 KiB). | Optional minify step. |
| P3 | Info (not app-fixable) | GitHub Pages 10-minute cache TTL. | None. The service worker already caches for repeat visits. |

## Regression guard added (tests only)
`tests/axe_baseline.py` (20 checks, run in CI after `e2e.py`) serves the app from a `/Tutorloop/` sub-path, like production, and runs axe-core 4.14.0 with WCAG 2.2 AA + best-practice tags on first run + 9 routes at 360 and 1280 px. It fails on any serious or critical violation not in `BASELINE`, which is empty. The moderate `skip-link` result (T3) is printed, not failed. T1 and T2 are manual findings that axe can't detect, so they are covered by the BACKLOG item, not by this guard.
