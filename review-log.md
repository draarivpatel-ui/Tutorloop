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

## Cycle 7 · Sun Oct 11 2026 10:25–11:10 PM EDT (team-a r6)
Re-read the Next Founders overview and rules (read-only, https://next-founders.devpost.com/ and /rules): 4 x 25% (Technical Execution, Innovation & UX, Business & Finance: "realistic business model, revenue streams, and a clear path to financial sustainability", Communication); the 5-minute video must cover problem, build, demo, scalability.
Shipped (3 atomic commits, CI green on each):
- **b746dcb, money correctness (sw v24).** New tests/money.property.test.js (seeded random histories and operation sequences; exact integer-cents reference; one balance everywhere; months add up; CSV/JSON round trips; every day 2024-2027) and tests/tz_test.py (50 Chromium checks: local calendar day at 11:30 PM in 7 zones, DST, month and year ends). Bug found and fixed: editing a part-paid session below what was already paid (or lowering the student's rate) left it "unpaid" owing $0 and showed e.g. "$783.13 of $78.00 paid"; making it volunteer or deleting it silently dropped money already received. Now the session is settled and the extra counts toward the family's oldest unpaid sessions, and the toast says so (or that it exceeds anything owed). Old backups are settled the same way on restore.
- **050d922, Business & Finance (sw v25).** "Break-even, in customers" on Why TutorLoop: sync on Cloudflare Workers Paid ($5/month minimum, sourced) is covered by 2 monthly Pro tutors, 2 annual Pro tutors, or 1 Club chapter (19 months), from the same Stripe fee math. Club's "up to 50 tutors" is marked roadmap (TutorLoop is single-tutor today); the Pro card shows "$36 a year, not on sale yet"; the first-run card says everything is free for up to 3 students and links to how TutorLoop makes money. No traction claimed; "No paying customers yet" kept.
- **bb3eb43, privacy (sw v26).** Delete a student now also removes their recorded payments (they stayed in storage and in a backup exported that session).
Tests: unit 65 + money property 10 + sw, DOM 63, e2e 204, print 32, tz 50, pitch_docs 28, devpost_claims 57.
Left as is (design call from Cycle r3): marking a part-paid session paid and then unpaid again brings back the full price; the payment log still lists the part payment. (Resolved in r7, below.)

## Cycle 8 (team-a r7, Sun Oct 11 ~11:40 PM EDT): final pre-deadline sweep
- **81f36ba, money consistency (sw v27).** Mark paid then Mark unpaid now gives a session back exactly what it still owed. Before, Mark paid dropped the part payment, so Unpaid billed the full price again while the payments log still listed the money (e.g. Ethan back to $90 owed after a logged $10). Now the part payment is held on the paid session (`heldPaid`, kept in backups, dropped on import from unpaid/volunteer sessions) and restored by the toggle, the Log form's Paid box, or after Mark all paid. Made volunteer or moved to another student while marked paid, the held money goes to the family's other unpaid sessions, like every other edit. Not changed: a session that Record a payment paid off completely still bills its full price if marked unpaid by hand (README Known limits says to use Undo). New property test (400 random histories x toggle / Log form / Mark all paid, with a backup in between: exact same balances, part payments and invoice totals after the round trip; plus worked examples for a rate cut and a volunteer switch) and 2 new invariants for every reachable state (held money only on paid sessions; sessions never claim more received money than the payments log holds). +3 DOM checks (fail on the old app). README now has test-table rows for money.property and tz_test.
- **Final regression sweep, live (aariv.me/Tutorloop, 390 + 1280 px, empty + sample data, all 9 pages):** 42/42 (page heading, no horizontal overflow, axe 0 serious/critical, 0 console errors, live Paid/Unpaid round trip shows "$10.00 of $90.00 paid"). devpost_claims --live 55/55, pitch_docs --live 28/28.
Tests: unit 65 + money property 11 + sw, DOM 66, e2e 204, print 32, tz 50, pitch_docs 28, devpost_claims 57 local / 55 live. CI green (run 38198229517); live bytes match.
**TutorLoop is frozen until judging, except critical bugs.**

## Cycle 9 · Mon Oct 12 2026 ~12:35–1:00 PM EDT: strict-judge source re-check
Re-fetched every cited source. Match: TutorBird $16.95 + $4.95; Teachworks Starter $16.49 + $0.320/lesson (both trials 30/21 days); Stripe 2.9% + 30¢, Billing PAYG 0.7%; Cloudflare Workers Paid $5/mo min, 10M requests, D1 included; Emergen $13.5B → $27.0B, 7.5%; NHS About 1.4M students, 1,000 hours/chapter, four pillars. Mismatch: NHS's History page (the source behind Wikipedia's "17,000+") says "more than 16,000 active chapters".
- **3cfbdac (sw v29).** Pitch page uses 16,000+ chapters cited to NHS History; ceiling 16,000 × $95.14 ≈ $1.5M; "checked" dates Oct 12. pitch-outline, demo-script, e2e/pitch_docs/devpost_claims checks synced (counts unchanged). Local devpost.md: stale e2e/unit counts and NHS figure fixed (not pushed; file is excluded).
Tests: unit 65 + 11 + sw, DOM 66, e2e 204, print 32, tz 50, pitch_docs 28, devpost_claims 57. CI green. Known drift on the frozen Devpost page: 17,000+ / ~$1.7M ceiling, 47/30/92 test counts.
