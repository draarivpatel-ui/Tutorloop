# TutorLoop

**Live demo:** https://aariv.me/Tutorloop/ · **Why TutorLoop / pricing:** https://aariv.me/Tutorloop/#about (GitHub Pages on a custom domain; the github.io address redirects there). Click **"Try it with sample data"** to explore. The sample students are fictional.

TutorLoop is a free web app for high school and college students who tutor. Log a session in about 10 seconds, see who still owes you, send parents a progress update or a payment reminder in one click, print an invoice, and export volunteer hours for your NHS sponsor. It's free and private, and it works offline after your first visit.

![TutorLoop empty dashboard with the 30-second quick-start form](docs/hero.png)

*Screenshot of the live site (Oct 2026), taken with headless Chromium.*

Built by Aariv Patel for the [Next Founders Hackathon](https://next-founders.devpost.com/) (October 2026).

---

## Judge it in 60 seconds

1. Open https://aariv.me/Tutorloop/ and click **Try it with sample data** (Maya, Ethan and Sofia are made up).
2. **Dashboard → Who owes you** shows each family's balance; open **Invoices**, pick a student, **Record a payment** of part of the balance, then **Print / Save PDF**.
3. **Parent updates** turns a session's notes into an editable message; **Service hours** prints a sponsor log with a signature line.
4. Tests (re-run Oct 12, 2026): `npm test` (65 unit + 11 money property tests + service-worker check), `npm i && npm run test:dom` (66), `python3 tests/e2e.py` (204), `python3 tests/print_test.py` (32), `python3 tests/tz_test.py` (50). GitHub Actions runs all five, plus the `tests/pitch_docs_test.py` docs check and the `tests/axe_baseline.py` WCAG 2.2 axe guard, on every push (`.github/workflows/test.yml`).

## The problem

Lots of high school and college students tutor younger kids in math, reading, or test prep. Some do it for pay, and some as volunteer tutoring for NHS service hours. Their "back office" is spread across the Notes app, Venmo, and memory:

- Sessions aren't tracked, so tutors **forget who owes them**, and chasing payment is awkward.
- Parents want to know whether tutoring is working, but writing **progress updates** by hand takes time, so most tutors never send them.
- At the end of the semester, volunteer tutoring hours have to be **re-typed into a log** for a sponsor.

Tutoring-company software (scheduling and billing suites) is built for businesses with staff. It's far more than a 16-year-old with three students needs or can pay for.

## Features

| Feature | Details |
|---|---|
| **Dashboard** | Earned and collected this month, all-time unpaid balance, service hours (with goal progress), a 6-month earnings chart, a "Who owes you" list with Invoice / Remind / Mark paid buttons, and **Quick log** buttons that start from your last session with each student |
| **30-second first run** | On an empty app, one quick-start form (student, rate, minutes, topics, how it went) creates the student and the first session, then the dashboard shows the drafted parent update, the invoice amount, and next steps |
| **10-second session log** | Student, date, minutes (quick 30/45/60/90 chips), optional rate override, topics, notes, paid or volunteer, with a live amount preview |
| **Parent updates** | Turns session topics and notes into a parent-ready progress email: topics ranked, a recency-weighted trend, the latest highlight, and the next focus. Presets for the last 30 days, this month, the last 90 days, or all sessions. **You can edit the text before you copy it or open it in your email app.** |
| **Payment reminders** | One click opens a polite, itemised reminder (dates, minutes, amounts, total, and "You can pay with Venmo @handle") addressed to the parent. The payment app is a setting, guessed from the handle if blank |
| **"Sent with TutorLoop" footer (optional)** | Off by default. Switch it on in Settings to end parent updates, reminders, and invoices with one plain link to TutorLoop. No tracking or referral code |
| **Invoices and part payments** | Unpaid sessions roll into an invoice (Print / Save as PDF) with a stable invoice number. Got only part of the money? Record the amount: it settles the oldest sessions first and keeps the remainder as a part payment, so the balance, the reminder email, the invoice and the monthly statement all show what is still owed (cent-exact, undoable, never more than the balance) |
| **Service hours** | Volunteer sessions count as $0, track progress toward an optional hour goal, export to CSV, and print as a sponsor log with a signature line |
| **Monthly summary** | Pick a month and one student (a family statement: sessions, topics, paid/unpaid, balance due, how to pay) or all students (a recap for you or your NHS sponsor, with service hours and a signature line when printed). Print / Save PDF, copy as text, or open in email |
| **Your data, your device** | Everything stays in `localStorage`. JSON backup and restore, CSV export, undo for every change (toast button or Ctrl/Cmd+Z), archive/restore students, and permanent delete when a family asks |
| **Freemium plans** | Free (3 active students), Pro, and Club, with the free limit enforced in the app. Settings shows your usage (e.g. 2 of 3 students) and what Pro costs in minutes of your own tutoring at your average rate. **Checkout is simulated, and no payment is taken.** |
| **Works offline / installable** | A service worker caches the app shell, and the web manifest lets you add it to your home screen |

## Tech stack and architecture

- **Vanilla HTML, CSS, and JavaScript.** No framework, no build step, no paid APIs, no server. Deploys as static files on GitHub Pages.
- `js/core.js` holds **pure business logic** with no DOM access, so it runs in Node and is unit-tested: money math rounded to cents, stats, balances, invoices, CSV export with formula-injection protection, import validation and migration, payment reminders, and the progress-report engine.
- `js/app.js` is a small **hash router** (`#dashboard`, `#log`, `#students`, `#reports`, `#invoices`, `#hours`, `#summary`, `#settings`, `#about`) with view functions, delegated event handlers, and snapshot-based undo.
- `sw.js` + `manifest.webmanifest`: offline app shell (network first, cache fallback), installable PWA.
- **Chart**: drawn with the Canvas 2D API, with no chart library and a text alternative for screen readers.
- **Persistence**: one versioned JSON document in `localStorage` (`tutorloop.v1`). Every load goes through `importState()`, which normalises types and drops bad rows.

```
index.html ─ styles.css ─ manifest.webmanifest ─ sw.js (offline cache)
   │
   ├── js/core.js   pure logic: stats, invoices, reminders, reports, CSV, validation   ← tests/core.test.js (unit)
   └── js/app.js    router, views, events, undo, localStorage                          ← tests/smoke.dom.js (jsdom)
                                                                                         ← tests/e2e.py (real Chromium)
```

### Why the "AI" runs on the device

Parent updates come from a deterministic, explainable text engine that runs in the browser:

1. Topics are counted and ranked (ties go to the most recent).
2. Each note is scored with whole-word patterns for progress ("improved", "confident", "mastered") and struggle ("confused", "needs more practice"). Phrases are only counted once, and negation is handled both ways: "not confident" is a struggle, and "wasn't confused" is progress.
3. Each session votes +1, −1, or 0, **weighted by recency**, so the trend reflects where the student is now. A struggle followed by a win is reported as "turning around" instead of re-quoting the old problem.
4. The latest win becomes the highlight. If the latest signal is a struggle, it becomes the next focus. Otherwise the summary says what's next.

The result is **$0 per report, no student data sent to a third party, and it works offline**. The tutor reviews and edits every message before sending. An optional LLM rewrite for Pro is on the roadmap, not built.

## Quality: what is tested

| Suite | Command | What it covers |
|---|---|---|
| Unit (65 tests + a service-worker check in `tests/sw.test.js` + this docs check in `tests/docs.test.js`, no dependencies) | `npm test` | Money and rounding, validation (impossible dates, typo-year future dates like 2062 and pre-2000 dates refused, duplicate student names refused, and a restored backup with duplicate names kept with a plain warning and told-apart labels), plan limits, stats, balances, monthly series, goal progress, presets, sentiment and negation, report wording, reminders, payment-app wording, the opt-in footer, monthly summaries and statements, Pro value math, invoices, CSV escaping and **formula injection**, import normalisation, and a 5,000-session performance check |
| DOM smoke (66 checks, jsdom) | `npm i && npm run test:dom` | Every route renders, quick start and first-run card, toast close/Escape/removal, monthly summary, plan usage, forms, plan limit, **XSS escaping**, persistence, undo, bad URLs, pitch-page honesty and fee math |
| End-to-end (204 checks, real headless Chromium, app served from a `/Tutorloop/` sub-path like production) | `pip install playwright && python -m playwright install chromium && python tests/e2e.py` | Real clicks with native form behaviour, the first-run quick start, toast auto-dismiss (and hover pause, close, Escape), the monthly summary, decimal rates, a refused 2062 session date and duplicate student name, XSS, undo (button and Ctrl+Z), CSV download, plan limit, archive/restore/delete, report presets and editing, backup round trip, archive -> restore -> pay off a part-paid student, a backup with two students of the same name (both kept, warned before and after, pickers tell them apart), corrupt-storage recovery, keyboard focus and skip link (focus never drops to the page body after a save or a backup restore; a restore lands on the Students heading), form errors marked on the field they are about (aria-invalid, linked to the message), duration chips whose spoken name matches their text, a **keyboard-only Record a payment pass at 390px and 1280px** (Tab order, errors announced once and linked to the field, a refused amount keeps focus on the field with the text selected, no traps, Escape/Undo on the toast return focus, arrow keys on the invoice and Summary month/student pickers keep focus on the picker), **offline reload through the service worker**, **service worker scope, manifest paths and cache isolation on a shared origin**, payment-app setting and footer opt-in/out, sourced competitor prices on the pitch page, no console errors, **axe-core WCAG 2.1 AA: 0 violations on all 9 pages plus the empty and first-run dashboards**, **no serious or critical axe issues on any page at 390px**, **no horizontal overflow at 1280px and 390px**, including with an 80-character one-word student name, a long parent email and a spaceless topic on 7 pages, no layout shift on first load at 390px and 1280px (CLS under 0.05; the footer used to paint at the top and jump), and print stylesheets |
| Print (32 checks, real headless Chromium + poppler) | `python tests/print_test.py` (or `npm run test:print`) | Every printable page saved as a US Letter PDF the way Print / Save PDF does it: an invoice for each sample student, a 30-session invoice, a part-paid invoice, the monthly summary, a family statement and the service-hour log. Checks the page count (invoices and statements fit 1 page; 30 sessions fit 2), that no app chrome prints (nav, buttons, Record a payment, sample-data bar), that the names, amounts, total and signature lines print, and that nothing is wider than the page. Printed pages are numbered (Page 1 of 2) and the total prints once, after the last row. |
| Money property tests (11 tests, seeded random histories, no dependencies; runs inside `npm test`) | `node tests/money.property.test.js` (replay with `SEED=`, go deeper with `ROUNDS=`) | 120,000 rate x minute pairs against exact integer-cents math; `money()` print and read-back; 400 random part-payment histories (owed drops by exactly the payment, oldest session first); refused payments change nothing; 400 random 40-step sequences of log, edit, pay, Mark paid/unpaid, archive/restore, delete, backup and rate edits, checking one balance everywhere (dashboard, invoice, reminder, statement, CSV), months adding up to all time, and that sessions never claim more money received than the payments log holds; Mark paid then Mark unpaid (toggle, Log form or Mark all paid, with a backup in between) restores the exact balance; CSV and JSON round trips with hostile text; every calendar day 2024 to 2027 |
| Time zones (50 checks, real headless Chromium) | `python3 tests/tz_test.py` (or `npm run test:tz`) | The browser clock fixed at 11:30 PM local in zones from UTC-11 to UTC+14 (including UTC+5:30 and Lord Howe's half-hour DST), across US DST switches both ways and the Oct 31 to Nov and year-end boundaries: the saved session date, the date picker's max, the invoice date and number, and "this month" all use the tutor's local day, never UTC |

All suites were re-run on Oct 12, 2026 (~12:50 PM ET): **65/65 unit + 11/11 money property tests (+ service-worker check), 66/66 DOM, 204/204 end-to-end, 32/32 print, 50/50 time-zone passing**. `tests/money.property.test.js` builds hundreds of random tutoring histories with a seeded generator (replay with `SEED=`, go deeper with `ROUNDS=`) and checks that every amount matches exact integer-cents math, that one balance shows everywhere (dashboard, invoice, reminder, statement, CSV), that part payments move money oldest first and never lose any of it, and that archive/restore, CSV and backup round trips change nothing. `tests/tz_test.py` fixes the browser clock at 11:30 PM in seven time zones (plus DST switches and month and year ends) and checks the session, invoice and "this month" use the tutor's local day. `python3 tests/devpost_claims.py` (57 checks; `--live` for aariv.me) re-checks every app claim on the submitted Devpost page against the running app. `python3 tests/pitch_docs_test.py` (28 checks; `--live` for aariv.me) checks that every number and button label `demo-script.md` and `pitch-outline.md` quote is what the app shows with the sample data.

`docs/REVIEW_LOG.md` records the review loop used to harden the app: the problems found in each iteration and how each was fixed.

## Data sources

- **No external data APIs.** Everything the app shows comes from what the tutor types in, stored in their own browser.
- **Sample data** ("Try it with sample data") is fictional students and sessions built into the app.
- **Competitor prices** on the pitch page (`#about`) are TutorBird's and Teachworks' list prices, each linked to the vendor's own pricing page ([tutorbird.com/pricing](https://www.tutorbird.com/pricing/), [teachworks.com/pricing](https://teachworks.com/pricing)); the end-to-end suite checks the figures and links are there.

## Security and privacy

- All user text is HTML-escaped before rendering. The tests try `<img onerror>` payloads.
- A strict **Content-Security-Policy** (`default-src 'self'`, no inline scripts or styles), plus `no-referrer`.
- CSV exports neutralise spreadsheet formulas (`=`, `+`, `-`, `@`) so a malicious topic can't run when a sponsor opens the file.
- There's no backend, so student data stays on the tutor's device. Unreadable saved data is set aside, never silently overwritten. Families' data can be permanently deleted.

## Scalability

- **Today:** static files on a CDN (GitHub Pages), so serving 10 or 100,000 tutors costs the same. Each tutor's data lives on their own device, so there's no server bottleneck. A unit test runs stats, balances, the 6-month chart series, and a report over 5,000 sessions and 50 students, and fails if they take longer than 1.5 seconds. In Node on the dev sandbox they took about 30 ms. A browser check loads 50 students and 5,000 sessions (about 0.9 MB, well inside the localStorage limit) and the dashboard re-renders in about 0.2 s. Reminders for a long backlog roll the oldest sessions into one line, and email links are capped, so a tutor with 60 unpaid sessions still gets a message their mail app can open.
- **Next (Pro):** cloud sync through hosted Postgres (for example Supabase) with row-level security per tutor. `core.js` doesn't change, because it already works on one JSON state object that maps onto `tutors`, `students`, and `sessions` tables.
- **Club:** a `club_id` and read-only sponsor roles so a chapter sponsor can see verified hours across their tutors.

## Business model

| Plan | Price | For |
|---|---|---|
| Free | $0 | Up to 3 active students: the full core loop |
| Pro | $4/month or $36/year | Unlimited students now. Cloud sync and scheduled reminders are on the roadmap |
| Club | $99 per school year | NHS chapters and peer-tutoring clubs (up to 50 tutors). Sponsor dashboard and verified hour reports are on the roadmap |

The cost to serve a free user is close to $0 (static hosting, on-device processing). Break-even for the first real cost (sync on Cloudflare Workers Paid, $5/month minimum) is 2 monthly Pro tutors, 2 annual Pro tutors, or 1 Club chapter after card and billing fees; the Why TutorLoop page shows the table. See `pitch-outline.md` for the pitch and go-to-market plan and `demo-script.md` for the video script.

## Run locally

```bash
python3 -m http.server 8080      # then open http://localhost:8080
npm test                         # unit tests (no install needed)
npm i && npm run test:dom        # jsdom smoke test
python3 tests/e2e.py             # e2e (needs: pip install playwright && python -m playwright install chromium; or CHROMIUM_PATH=/usr/bin/chromium to use a system Chromium)
SHOTS=out python3 tests/e2e.py   # e2e + screenshots of every page (desktop, mobile, print)
python3 tests/print_test.py      # print check: every printable page as a US Letter PDF (needs playwright; poppler-utils for page/text checks)
python3 tests/pitch_docs_test.py # the demo script and pitch outline quote what the app really shows
python3 tests/axe_baseline.py    # 20 checks: WCAG 2.2 AA + best-practice axe-core guard at 360/1280 px, incl. target-size (WCAG 2.5.8, off by default in axe): fails only on a serious/critical violation not in the Oct 12, 2026 audit baseline
```

## Deploy (GitHub Pages)

Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save.** The site goes live in about a minute. This repo is served at `https://aariv.me/Tutorloop/` because the account's user site uses the custom domain `aariv.me`. Note that GitHub Pages paths are case-sensitive: `/Tutorloop/` works, `/tutorloop/` is a 404.

## Known limits (honest)

- Data lives in one browser. Use **Download backup** to move it to another device (there's no sync yet).
- On iPhone, iPad and Mac Safari, WebKit's tracking prevention deletes a website's script-writable storage (including `localStorage` and the offline cache) after seven days of Safari use without the person interacting with the site ([WebKit blog, Mar 2020](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)). WebKit says it does not expect this for web apps added to the Home Screen. TutorLoop does not work around this yet, so on Safari, add it to the Home Screen or download a backup regularly.
- Payment is tracked, not processed. Reminders and updates open in your own email app.
- Plan upgrades are simulated. "Cloud sync", "scheduled reminders", and the "Club sponsor dashboard" are roadmap items.
- Mark paid then Mark unpaid gives a session back exactly what it still owed, part payment included. A session that **Record a payment** paid off completely counts as paid by those payments, so marking it unpaid by hand bills its full price again while the payment stays in the log; use **Undo** right after a mistaken payment instead.
- The whole app is English-only for now (no Spanish or other language mode).
- Printing is tested at US Letter in Chromium; other paper sizes and browsers should work but aren't covered by the print check.
- axe-core reports 0 WCAG A/AA violations on every page at 390 and 1280 px. One best-practice note stays at 390 px: when the scrolling top menu has scrolled some page links out of view, axe's `skip-link` heuristic mistakes those in-page route links (`#log`, `#invoices`) for skip links without a target. They are menu links, not skip links; the real "Skip to content" link works and is tested. Renaming the routes to silence it would change every saved link, so it's left as is.
- The update engine is rule-based and English-only. It's good at summarising notes, but it doesn't understand them like a person would, which is why every message is editable.

## AI assistance

This project was built with help from an AI assistant (Hark), which drafted code, tests and copy under Aariv Patel's direction. The app itself calls no AI service: parent updates come from the on-device, rule-based engine described above.

The demo video on the Devpost page (rendered before submission on Oct 11, 2026) was also made with Hark: it has no voiceover, and Hark recorded the screen footage of the live app and drafted its on-screen captions, chapter cards and edit over a music bed. Its test card (47 passed) was true when it was rendered; the current counts are earlier in this README.

## Roadmap

1. Cloud sync and login (Pro)
2. Scheduled payment reminders by email or text
3. Recurring weekly sessions and a calendar view
4. Club sponsor dashboard with verified service hours
5. Optional LLM polish for parent updates

## Third-party licences

The app ships no third-party code and calls no outside APIs. What it does use from others, with licence and source (checked Oct 13, 2026):

| What | How TutorLoop uses it | Licence | Source |
|---|---|---|---|
| IBM Plex Sans 400/600/700 and IBM Plex Mono 500 (latin subsets) | self-hosted in `fonts/` | SIL Open Font License 1.1, © 2017 IBM Corp., Reserved Font Name "Plex"; full text in `fonts/OFL.txt` | https://github.com/IBM/plex |
| jsdom | dev dependency for the DOM smoke test, never shipped | MIT | https://github.com/jsdom/jsdom |
| axe-core | dev dependency for the accessibility checks, never shipped | MPL-2.0 | https://github.com/dequelabs/axe-core |
| Playwright | end-to-end tests in CI, never shipped | Apache-2.0 | https://github.com/microsoft/playwright-python |

Competitor prices on the pitch page are facts quoted with a link to each vendor's own page (see **Data sources**); no vendor text or images are copied.

## License

MIT © 2026 Aariv Patel
