## Cycle 1 · Sat Oct 10 2026 5 PM CT
Baseline audit only: npm test 33/33, test:dom 19/19 pass. No changes shipped. Next: mobile/a11y review and one feature.

## Cycle 2 · Sat Oct 10 2026 6:40 PM CT
Re-verified npm test and test:dom pass (code-level only; no chromium). No changes shipped.

## Cycle 3 · Sat Oct 10 2026 7:06–7:20 PM CT
Shipped (pushed to draarivpatel-ui/Tutorloop, live at https://aariv.me/Tutorloop/, verified in a browser):
- **Payment wording fix** (core.js reminderMessage + progressReport): "You can pay by @aariv-tutoring." is now "You can pay with Venmo @aariv-tutoring." New Settings field "Payment app" (Venmo/Zelle/PayPal/Cash App suggestions or free text). Blank = guessed from the handle (@x → Venmo, $x → Cash App, email/phone → Zelle); a handle that already names an app isn't double-labelled; free text with no app reads "Payment: …". Invoice says "Pay with: Venmo @…". Live preview of the sentence in Settings. Old backups import fine.
- **"Sent with TutorLoop" footer**: opt-in checkbox in Settings, off by default (also off in demo data). Adds "--" + one plain line with https://aariv.me/Tutorloop/ to parent updates, reminders, and the invoice. No tracking or referral code; the Settings help text says so.
- **Competitor comparison** on Why TutorLoop: TutorBird $16.95/mo + $4.95 per extra tutor/staff; Teachworks Starter $16.49/mo + $0.32 per student lesson; example month (8 lessons) $16.95 / $19.05 vs TutorLoop Free $0; a "to be fair" note; source links. Both prices fetched from the vendors' pricing pages Oct 10, 2026.
- sw.js cache bumped to v4. devpost.md, pitch-outline.md, README.md, demo-script.md updated (footer no longer "planned"; test counts).
Tests: unit 41/41 (+8), jsdom 19/19, e2e 71/71 (+7 new checks; was 64). Noted, not changed: the "Sample data loaded" undo toast stays visible after loading demo data (pre-existing behaviour).

## Cycle 4 · Sat Oct 10 2026 7:25–8:10 PM CT
Strict-judge review (Next Founders, 4 × 25%). Gaps found: first run needed 3 pages before a tutor saw value (Innovation & UX); no month-end artifact for parents or NHS sponsors (UX + Business); plans were static cards, not tied to the tutor's own numbers (Business & Finance); the Undo toast lingered (Technical).
Shipped (pushed to draarivpatel-ui/Tutorloop, sw.js cache v6):
- **Toast bug fixed:** "Sample data loaded" (and every) toast now auto-dismisses (8s with Undo, 3s plain), pauses while hovered/focused, has a × close button, closes on Escape, and is fully removed afterwards (hidden + emptied). Before, it only faded to opacity 0, leaving an invisible, focusable Undo button and text in the page. Ctrl/Cmd+Z still undoes after it's gone.
- **30-second first run:** quick-start form on the empty dashboard (student, rate, minutes chips, topics, how it went, volunteer) creates the student + first session in one save; dashboard shows a first-run card with the drafted parent update, the invoice amount (or service hours), and next steps. Focus moves to the card.
- **Monthly summary** (#summary/YYYY-MM[/student], nav "Summary"): family statement (sessions, topics, paid/unpaid, balance due, pay-with line, Open in email) or all-students recap (per-student table, totals, service hours, sponsor signature line in print). Print/PDF and Copy as text. Pure core functions: summaryMonths, monthSummary, summaryText.
- **Plan usage on Settings & plans:** "N of 3 active students" meter and "Pro is $4 a month, about N minutes of tutoring at your average paid rate" (core proValue; 9 min for sample data), plus a plain statement that Pro only unlocks more students today.
- Polish: toast no longer squeezes to half the screen width on phones; nav label "Summary" so all 9 links fit at 1280px; "1 paid hour" grammar; mobile tfoot stacking.
Tests: unit 47/47 (+6), jsdom 30/30 (+11), e2e 92/92 (+21). Docs: devpost.md, README.md, demo-script.md (new shot 3 quick start, shot 7 summary, shot 9 usage), pitch-outline.md test counts.
Note: another process updated devpost.md/demo-script.md test counts (to 47/30) mid-cycle at ~7:36 PM CT despite the lock; reconciled.

## Cycle 5 · Sun Oct 11 2026 11:45 AM–12:20 PM CT
Strict-judge + real-user pass at 390 and 1280 px (EN, sample data and a 5,000-session stress dataset). Entry is already submitted, so changes are additive and none touch a flow shown in the video.
Shipped (sw.js cache v7):
- **Rounding bug:** exact half-cent amounts rounded down (5.02/hr x 15 min showed $1.25, not $1.26; about 3% of cent-precision rates). cents() now rounds on a 12-digit value. Found by comparing sessionAmount to integer math over 85,000 rate/minute pairs; 2,513 differed before, 0 after.
- **Thousands separators:** money() prints $1,234.50 (it printed $1234.50 while the rate error already said "$1,000"); chart labels too.
- **Long backlogs:** a payment reminder for 40+ unpaid sessions listed every session, and with 5,000 sessions the dashboard held 275 KB of "Remind" email links. Reminders now list the latest 12 sessions and roll older ones into one line (total unchanged); mailto() trims at 8,000 characters with a visible "shortened" note, so no mail app silently drops a link.
- **Polish:** Settings/log checkboxes no longer squash to a 13 px box with centred two-line labels.
Tests: unit 50/50 (+3), jsdom 30/30, e2e 96/96 (+4 scale checks: 5,000 sessions / 50 students re-render in ~0.2 s, separators, email links under 8,200 chars, 0 page errors).
Not done / ideas: partial payments (credit toward next session); recurring weekly schedule.

## Cycle 6 · Sun Oct 11 2026 12:00–12:40 PM CT
Backlog item: partial payments. The entry is already submitted, so this is additive and touches no flow shown in the video.
Gap (Business & Finance, UX): a parent who pays $40 of a $75 balance left the tutor two bad choices, mark a $25 session paid and lose track of the rest, or leave everything unpaid.
Shipped (sw.js cache v9):
- **Record a payment** on the Invoices page: enter what the family sent; it settles the oldest sessions first (by date, not entry order) and keeps the remainder as a part payment on the next-oldest. Refused when empty, zero, negative, over $100,000, or more than the balance (no prepayments, said plainly). Undo works; a payment history list sits under the form.
- Everything that shows money now uses what is still owed: dashboard totals and Who owes you, invoice (with an 'already paid' line per part-paid session), reminder email ('$10.00 left ($15.00 already paid of $25.00)'), monthly statement, parent progress report, CSV export (new Part paid column). Old data with no part payments behaves exactly as before.
- Backups and undo keep part payments and the payment log; bad rows (unknown student, bad date, negative amount, volunteer sessions) are dropped on import.
Tests: unit 51 -> 58 (cent precision with 33.33/hr and four small payments, oldest-first by date, refusal cases, purity, import/backup, CSV), DOM 30 -> 38, Chromium e2e 106 -> 112 (typing into the real field, negative refused, exact balance drop, focus returns, undo). Visual check at 390 and 1280 px in Chromium: form, button and part-paid note fit, no overflow.
