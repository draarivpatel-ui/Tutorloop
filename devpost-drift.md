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
