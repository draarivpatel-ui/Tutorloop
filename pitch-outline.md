# TutorLoop: founder pitch outline

**One-liner:** TutorLoop is the back office for student tutors: log a session in 10 seconds, see who owes you, send parents a progress update in one click, and export service hours your NHS sponsor can sign.
**Founder:** Aariv Patel, high school student, Math and Science Academy (Fort Bend ISD, Houston area, TX). Solo team.
**Live product:** https://aariv.me/Tutorloop/ (pitch page: https://aariv.me/Tutorloop/#about) · **Code:** https://github.com/draarivpatel-ui/Tutorloop
**Stage:** working prototype, built October 2026 for Next Founders. No users, no revenue, no pilots yet.

Use this outline as a 10-slide deck, as b-roll for the video (`demo-script.md`), or as speaking notes if judges ask questions.

---

## 1. Problem
Students who tutor run a real small business, but they do it with tools built for something else: a notes app for sessions, a Venmo feed to guess who paid, a separate text thread with each parent, and a paper sheet for volunteer hours. Three things break:
- **Money slips.** After a few weeks it's hard to remember which sessions were paid, and asking a parent for money is awkward, so tutors under-collect.
- **Parents go dark.** Families paying for tutoring want to know what was covered and whether it's working. Writing that every week takes time, so it rarely happens.
- **Hours need proof.** Volunteer tutoring often counts toward NHS or other service-hour requirements, which need a log a sponsor can sign. Students rebuild it by hand at the end of the semester.

**Why existing tools miss them:** tutoring and scheduling software is built for tutoring companies with staff, payroll, and a budget. It's too complex and too expensive for a 16-year-old with three students. Generic tools (spreadsheets, notes, Venmo) each cover one job and don't talk to each other.

*Evidence status:* the problem comes from what Aariv sees among students at his school. There are no formal interviews or survey data yet. Add 3–5 real tutor quotes here if you collect them; don't invent any.

## 2. Solution
One free web app that does the four jobs in one loop: **Log → Get paid → Update parents → Prove hours.**
- **10-second session log** with duration chips, topics, notes, paid/volunteer, and a live amount preview. Quick log repeats your last session with a student.
- **Get paid:** a "Who owes you" list (with part-paid amounts like "$12.34 of $90.00 paid"), a **Record a payment** form that covers the oldest sessions first and keeps the remainder as a part payment, one-click itemised payment reminders that open in your email app, printable invoices, and a family statement that lists the payments received that month.
- **Update parents:** an on-device engine turns your own session notes into an editable progress update (topics, recency-weighted trend, latest highlight, next focus, balance).
- **Prove hours:** volunteer sessions tracked toward a goal, exported as CSV or a printable log with a sponsor signature line.
- **Private by design:** no account, no server; data stays in the browser. That matters because tutors handle information about minors. Undo on every action, JSON backup/restore, a "You're exploring sample data" bar with a one-click "Start fresh with my own students" (undoable), works offline after the first visit, installable on a phone.

**What makes it different:** it's built for the student tutor specifically (service hours plus parent comms plus payments in one place), it's free for the core job, and it costs almost nothing to serve because it has no backend.

## 3. Market
- **Top-down:** the US private tutoring market was about **$13.5B in 2024**, projected to reach **$27.0B by 2034** (7.5% CAGR) per Emergen Research (https://www.emergenresearch.com/industry-report/us-private-tutoring-market). TutorLoop doesn't take a cut of tutoring revenue, so this is context for how much activity exists, not our revenue pool.
- **Channel we can reach:** the National Honor Society has **17,000+ chapters and about 1.4 million active members** (https://en.wikipedia.org/wiki/National_Honor_Society, citing NHS/NASSP). Every chapter has a faculty sponsor who has to collect service-hour records.
- **Bottom-up ceiling (illustrative, not a forecast):** 17,000 NHS chapters × $99/year Club plan ≈ **$1.7M/year** at list price, or about **$1.6M/year** after Stripe fees (17,000 × $95.14 kept, the figure the app shows), if every chapter paid. A realistic early goal is a few chapters in Fort Bend ISD. Pro revenue from individual paid tutors would come on top; we don't have a reliable count of student tutors, so we don't size it.
- **In the product:** the Why TutorLoop page (https://aariv.me/Tutorloop/#about) has a **"Who pays, and how we reach them"** section that makes this case on screen: the first payer we can reach is the NHS adviser who collects every tutor's hours; the average chapter contributes about 1,000 service hours a year; one Club plan covers up to 50 tutors, so one adviser's yes brings a whole chapter; costs today are $0 a month; and the first real cost (a Pro sync server) is only built once paying users ask for it. Sources on the page: NHS About page and Wikipedia, checked Oct 11, 2026.
- **Beachhead:** high school students in the Houston area who tutor 1–10 kids, starting with NHS and math-club members at Aariv's own school.

## 4. Business model
Freemium, with a B2B2C channel through school clubs.

| Plan | Price | Who pays | What it includes today | Roadmap |
|---|---|---|---|---|
| Free | $0 | – | The full core loop for up to 3 active students | – |
| Pro | $4/month | Tutors whose tutoring has become a real side business | Unlimited students | Cloud sync, scheduled reminders |
| Club | $99/school year | NHS chapters and peer-tutoring clubs (up to 50 tutors) | Unlimited students for members | Sponsor dashboard, verified hour reports |

**Unit economics (list price minus Stripe's published US fees of 2.9% + 30¢ per card charge and 0.7% for Billing):**
- Pro: $4.00 − $0.44 = **$3.56 kept per month (89%)**
- Club: $99.00 − $3.86 = **$95.14 kept per year (96%)**
- Cost to serve a free user today ≈ $0: static hosting on GitHub Pages, all processing on the user's device. Paid tiers add sync/storage and email costs only once those features exist.
- The flat 30¢ fee eats into a $4 monthly charge, so an annual Pro option (for example $36/year) is the first pricing test.
- **Principle:** we won't charge for Pro's sync or scheduled reminders until they are built. Checkout in the app today is a simulation.
- Later option: a small fee on payment links if we add in-app payments.

**Path to sustainability:** near-zero fixed cost means a handful of Club chapters covers hosting, a sync database, and email many times over. Growth comes through sponsors (one sponsor = 20–50 tutors) rather than paid ads.

## 5. Go-to-market
The same four steps appear in order on the app's Why TutorLoop page under "Who pays, and how we reach them".
1. **Seed:** NHS and math-club members at Math and Science Academy and nearby Fort Bend ISD schools; demo at a chapter meeting.
2. **Sponsor wedge:** offer one NHS sponsor a free semester of Club in exchange for feedback. The sponsor's pain (collecting and verifying hours) is what drives a chapter-wide rollout.
3. **Built-in referral (built, opt-in):** a "Sent with TutorLoop" line the tutor can switch on in Settings. It ends parent updates, payment reminders, and invoices with a plain link, so every parent who receives one can find the product. It's off by default and has no tracking or referral code, so we can't measure it yet; measuring would mean adding a privacy-respecting referral count later.
4. **Content:** short "how I run my tutoring" videos aimed at student tutors.

## 6. Traction (stated honestly)
**None yet.** No users, no paying customers, no pilots, no waitlist, no usage numbers. What exists:
- A working, publicly deployed product at https://aariv.me/Tutorloop/.
- 65 unit tests, 52 DOM checks, 174 headless-Chromium end-to-end checks and 32 print checks, all passing on Oct 11, 2026 (~8:15 PM ET; re-run before quoting). GitHub Actions runs all four on every push.
- An in-app pitch page that states the same thing: "No paying customers yet, and no usage numbers to claim."

## 7. Technology (why it can scale cheaply)
- Static HTML/CSS/vanilla JS, no framework or build step, served from a CDN.
- `core.js` is pure logic (money in cents, balances, invoices, CSV export with formula-injection protection, report engine), unit-tested in Node. `app.js` is a hash router plus views with XSS-safe rendering under a strict Content-Security-Policy. `sw.js` provides offline caching.
- Data lives on each tutor's device today, so there's no server bottleneck. A test runs 5,000 sessions across 50 students under a 1.5-second budget.
- **Next:** for Pro sync, the single JSON state object maps onto `tutors`, `students`, and `sessions` tables in hosted Postgres with row-level security, and `core.js` stays the same. Club adds a `club_id` and read-only sponsor roles.

## 8. Competition
| Option | What it does well | Why it misses student tutors |
|---|---|---|
| Tutoring-business software: TutorBird ($16.95/mo + $4.95 per extra tutor), Teachworks Starter ($16.49/mo + $0.32 per student lesson) | Full business management: scheduling, billing, portals | Priced and designed for companies with staff; ~$17–19/mo is a lot for a student with two or three families |
| Spreadsheets + notes app | Free, flexible | No parent updates, no reminders, nothing connected |
| Venmo/Zelle | Moving money | No record of what each payment was for |
| Paper or Google Form hour logs | What sponsors already accept | Re-typed by hand; nothing ties hours to actual sessions |

Prices: vendors' own pricing pages, monthly billing, checked Oct 10, 2026 (https://www.tutorbird.com/pricing/, https://teachworks.com/pricing). The same comparison is on the app's Why TutorLoop page.

TutorLoop's edge: the only tool here built around a *student* tutor's four jobs, including service hours, free for the core use case, private by default.

## 9. Roadmap
- **Next 30 days:** interview 10 student tutors and 2 NHS sponsors; turn on a waitlist; fix what they flag.
- **This semester:** pilot Club with one NHS chapter (free); recurring sessions; annual Pro pricing test.
- **Before charging for Pro:** cloud sync and login (Postgres with row-level security); scheduled payment reminders.
- **Club v1:** sponsor dashboard with verified service-hour reports.
- **Later:** optional LLM polish for parent updates (Pro); optional payment links.

## 10. The ask
Ten student tutors and two NHS sponsors willing to pilot TutorLoop this semester, and honest feedback on what they'd pay for.

---

### Likely judge questions (short answers)
- **"Why would a student pay?"** Most won't, and that's fine: the free tier costs ~$0 to serve. Pro is for tutors whose side business has outgrown three students; Club is paid by the chapter, not the student.
- **"Isn't localStorage fragile?"** Yes, for a business. That's why JSON backup/restore exists today and sync is the first paid feature. Corrupted storage is set aside instead of overwritten.
- **"Is the 'AI' real?"** It's a deterministic on-device text engine (topic ranking, progress/struggle scoring with negation, recency-weighted trend). It's free, private, and explainable. An LLM rewrite is a roadmap option for Pro.
- **"What about student data privacy?"** Nothing leaves the device today. When sync arrives, per-tutor row-level security and permanent delete, which already exists locally.
