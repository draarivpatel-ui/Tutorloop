# TutorLoop: submitted Devpost text vs the live app (read-only drift check)

Checked Sun Oct 11, 2026 ~12:55 PM CDT. Nothing on Devpost was edited (entry is frozen).
Code: local = https://aariv.me/Tutorloop/ (HTTP 200; js/app.js live has "Record a payment"). `npm test` 60 passed, `npm run test:dom` 45 passed.

## What the submitted page says that is now outdated (true when submitted, behind the app)
1. Test counts: submitted text says 47 unit / 92 e2e (30 DOM). Current: 60 unit / 45 DOM / 128 Chromium.
2. "Paid/unpaid is each session's current status; TutorLoop doesn't record payment dates." Now there is a Record a payment flow (Invoices page): oldest sessions first, remainder kept as a part payment; balances, reminders, invoices, the monthly statement, report and CSV all use the amount still owed. The monthly family statement has a "Payments received in <month>" section.
3. "Annual Pro pricing" is listed as roadmap/not built. The Why TutorLoop page now shows a "Pro (annual)" row at $36/yr (Stripe fees $1.60, keeps $34.40 = 96%), marked not on sale yet. Still honest: nothing is for sale.
4. The Why TutorLoop page has a "Who pays, and how we reach them" section and a sample-data "Start fresh" bar; neither is in the original text.
5. Accessibility: mobile (390 px) axe scan of every route is now in the e2e suite (0 serious/critical).

## Still true
Free/Pro/Club prices, "no traction yet", on-device processing, CSV injection protection, offline mode.

## For Aariv
No action required; the judges see the live app, which is ahead of the text. If you ever re-edit the page (deadline Oct 15 4 PM CT), use devpost.md, which already carries 60/45/128.

## Re-check Sun Oct 11, 2026 ~8:30 PM EDT (team-a r3, read-only web_fetch of https://devpost.com/software/tutorloop; Devpost not edited)
Automated now: `python3 tests/devpost_claims.py` (57 checks local incl. offline + manifest; 55 with `--live` on aariv.me) clicks every app claim on the page at 1280 and 390 px: 30-second first run, 30/45/60/90 chips + live preview, dashboard KPIs + 6-month chart + Who owes you (Invoice / Remind / Mark paid) + Quick log, Remind ends "You can pay with Venmo @...", footer off by default, parent update edit/copy/email, printable invoice, service hours CSV + sponsor signature line, monthly summary (all / family statement; print, copy, email), backup/restore/CSV/erase, undo, Free 3 / Pro $4 / Club $99, $3.56 / $95.14, 17,000+ chapters, "No paying customers yet", demo checkout. All pass; nothing regressed.
Mismatches on the frozen page:
1. Test counts 47 unit / 30 DOM / 92 e2e: now 65 unit (+ service-worker check) / 55 DOM / 174 e2e / 32 print (understates).
2. "Club alone is a ~$1.7M/year ceiling": the app's Why page says ≈ $1.6 million, because it multiplies 17,000 by what TutorLoop keeps after Stripe fees ($95.14), while Devpost rounds the gross (17,000 × $99 = $1.68M). Both are true; just different bases.
3. The page doesn't mention part payments, the duplicate-name rule or the backup duplicate-name warning (the app does more than the text says).
- Re-run Oct 12 2:05 AM CDT: npm test 65 passed, test:dom 66 passed; devpost.md counts synced locally (e2e count unchanged, run before quoting). Devpost page untouched.
