# TutorLoop

**The back office for student tutors.** Log a session in about 10 seconds, see who still owes you, send parents a progress update or a payment reminder in one click, print an invoice, and export volunteer hours for your NHS sponsor. It's free and private, and it works offline after your first visit.

Built by Aariv Patel for the [Next Founders Hackathon](https://next-founders.devpost.com/) (October 2026).

**Live demo:** https://aariv.me/Tutorloop/ (GitHub Pages on a custom domain; the github.io address redirects there). **Why TutorLoop / pricing:** https://aariv.me/Tutorloop/#about. Click **"Try it with sample data"** to explore. The sample students are fictional.

---

## The problem

Lots of high school and college students tutor younger kids in math, reading, or test prep. Some do it for pay, and some as volunteer tutoring for NHS service hours. Their "back office" is spread across the Notes app, Venmo, and memory:

- Sessions aren't tracked, so tutors **forget who owes them**, and chasing payment is awkward.
- Parents want to know whether tutoring is working, but writing **progress updates** by hand takes time, so most tutors never send them.
- At the end of the semester, volunteer tutoring hours have to be **re-typed into a log** for a sponsor.

Tutoring-company software (scheduling and billing suites) is built for businesses with staff. It's far more than a 16-year-old with four students needs or can pay for.

## What it does

| Feature | Details |
|---|---|
| **Dashboard** | Earned and collected this month, all-time unpaid balance, service hours (with goal progress), a 6-month earnings chart, a "Who owes you" list with Invoice / Remind / Mark paid buttons, and **Quick log** buttons that start from your last session with each student |
| **10-second session log** | Student, date, minutes (quick 30/45/60/90 chips), optional rate override, topics, notes, paid or volunteer, with a live amount preview |
| **Smart parent updates** | Turns session topics and notes into a parent-ready progress email: topics ranked, a recency-weighted trend, the latest highlight, and the next focus. Presets for the last 30 days, this month, the last 90 days, or all sessions. **You can edit the text before you copy it or open it in your email app.** |
| **Payment reminders** | One click opens a polite, itemised reminder (dates, minutes, amounts, total, your Venmo/Zelle handle) addressed to the parent |
| **Invoices** | Unpaid sessions roll into a clean invoice (Print / Save as PDF) with a stable invoice number |
| **Service hours** | Volunteer sessions count as $0, track progress toward an optional hour goal, export to CSV, and print as a sponsor log with a signature line |
| **Your data, your device** | Everything stays in `localStorage`. JSON backup and restore, CSV export, undo for every change (toast button or Ctrl/Cmd+Z), archive/restore students, and permanent delete when a family asks |
| **Freemium plans** | Free (3 active students), Pro, and Club, with the free limit enforced in the app. **Checkout is simulated, and no payment is taken.** |
| **Works offline / installable** | A service worker caches the app shell, and the web manifest lets you add it to your home screen |

## Tech stack and architecture

- **Vanilla HTML, CSS, and JavaScript.** No framework, no build step, no paid APIs, no server. Deploys as static files on GitHub Pages.
- `js/core.js` holds **pure business logic** with no DOM access, so it runs in Node and is unit-tested: money math rounded to cents, stats, balances, invoices, CSV export with formula-injection protection, import validation and migration, payment reminders, and the progress-report engine.
- `js/app.js` is a small **hash router** (`#dashboard`, `#log`, `#students`, `#reports`, `#invoices`, `#hours`, `#settings`) with view functions, delegated event handlers, and snapshot-based undo.
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
| Unit (33 tests, no dependencies) | `npm test` | Money and rounding, validation (including impossible dates), plan limits, stats, balances, monthly series, goal progress, presets, sentiment and negation, report wording, reminders, invoices, CSV escaping and **formula injection**, import normalisation, and a 5,000-session performance check |
| DOM smoke (19 checks, jsdom) | `npm i && npm run test:dom` | Every route renders, forms, plan limit, **XSS escaping**, persistence, undo, bad URLs, pitch-page honesty and fee math |
| End-to-end (64 checks, real headless Chromium, app served from a `/Tutorloop/` sub-path like production) | `pip install playwright && python -m playwright install chromium && python tests/e2e.py` | Real clicks with native form behaviour, decimal rates, XSS, undo (button and Ctrl+Z), CSV download, plan limit, archive/restore/delete, report presets and editing, backup round trip, corrupt-storage recovery, keyboard focus and skip link, **offline reload through the service worker**, **service worker scope, manifest paths and cache isolation on a shared origin**, no console errors, **axe-core WCAG 2.1 AA: 0 violations on all 8 pages**, **no horizontal overflow at 1280px and 390px**, and print stylesheets |

`docs/REVIEW_LOG.md` records the review loop used to harden the app: the problems found in each iteration and how each was fixed.

## Security and privacy

- All user text is HTML-escaped before rendering. The tests try `<img onerror>` payloads.
- A strict **Content-Security-Policy** (`default-src 'self'`, no inline scripts or styles), plus `no-referrer`.
- CSV exports neutralise spreadsheet formulas (`=`, `+`, `-`, `@`) so a malicious topic can't run when a sponsor opens the file.
- There's no backend, so student data stays on the tutor's device. Unreadable saved data is set aside, never silently overwritten. Families' data can be permanently deleted.

## Scalability

- **Today:** static files on a CDN (GitHub Pages), so serving 10 or 100,000 tutors costs the same. Each tutor's data lives on their own device, so there's no server bottleneck. A unit test runs stats, balances, the 6-month chart series, and a report over 5,000 sessions and 50 students, and fails if they take longer than 1.5 seconds. In Node on the dev sandbox they took about 30 ms.
- **Next (Pro):** cloud sync through hosted Postgres (for example Supabase) with row-level security per tutor. `core.js` doesn't change, because it already works on one JSON state object that maps onto `tutors`, `students`, and `sessions` tables.
- **Club:** a `club_id` and read-only sponsor roles so a chapter sponsor can see verified hours across their tutors.

## Business model

| Plan | Price | For |
|---|---|---|
| Free | $0 | Up to 3 active students: the full core loop |
| Pro | $4/month or $36/year | Unlimited students now. Cloud sync and scheduled reminders are on the roadmap |
| Club | $99 per school year | NHS chapters and peer-tutoring clubs (up to 50 tutors). Sponsor dashboard and verified hour reports are on the roadmap |

The cost to serve a free user is close to $0 (static hosting, on-device processing). See `devpost.md` for the pitch, go-to-market plan, and video script.

## Run locally

```bash
python3 -m http.server 8080      # then open http://localhost:8080
npm test                         # unit tests (no install needed)
npm i && npm run test:dom        # jsdom smoke test
python3 tests/e2e.py             # e2e (needs: pip install playwright && python -m playwright install chromium; or CHROMIUM_PATH=/usr/bin/chromium to use a system Chromium)
SHOTS=out python3 tests/e2e.py   # e2e + screenshots of every page (desktop, mobile, print)
```

## Deploy (GitHub Pages)

Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save.** The site goes live in about a minute. This repo is served at `https://aariv.me/Tutorloop/` because the account's user site uses the custom domain `aariv.me`. Note that GitHub Pages paths are case-sensitive: `/Tutorloop/` works, `/tutorloop/` is a 404.

## Known limits (honest)

- Data lives in one browser. Use **Download backup** to move it to another device (there's no sync yet).
- Payment is tracked, not processed. Reminders and updates open in your own email app.
- Plan upgrades are simulated. "Cloud sync", "scheduled reminders", and the "Club sponsor dashboard" are roadmap items.
- The update engine is rule-based and English-only. It's good at summarising notes, but it doesn't understand them like a person would, which is why every message is editable.

## Roadmap

1. Cloud sync and login (Pro)
2. Scheduled payment reminders by email or text
3. Recurring weekly sessions and a calendar view
4. Club sponsor dashboard with verified service hours
5. Optional LLM polish for parent updates

## License

MIT © 2026 Aariv Patel
