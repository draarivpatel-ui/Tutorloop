# TutorLoop review log

A strict-judge + real-user review loop run before submission. Each iteration: review → write problems here → fix → unit tests + headless Chromium (Playwright) e2e/visual/axe checks → screenshots inspected.

Severity: **P0** broken / data loss / security · **P1** hurts a judge's score or a real user · **P2** polish.

---

## Iteration 1 (Oct 10, 2026), baseline review

Tools: 14 unit tests (pass), jsdom smoke test (pass), first real-browser run (Playwright + Chromium 131, desktop 1280px and mobile 390px), axe-core 4.x.

### Found
| # | Sev | Area | Problem |
|---|---|---|---|
| 1 | P0 | Bug | **The "Log session" form can't be submitted with its default value.** `min="1" step="5"` makes 60 an invalid value in a real browser ("nearest valid values are 56 and 61"). The jsdom smoke test skipped native validation, so it never caught this. Rate `step="1"` also blocks $22.50. |
| 2 | P0 | Data loss | A corrupt or unreadable `localStorage` value silently loads an empty state, and the next save overwrites the user's data. Save errors (quota, private mode) aren't caught. |
| 3 | P0 | Security | CSV exports allow **formula injection**: a topic like `=HYPERLINK(...)` runs when a sponsor opens the CSV in Excel or Sheets. |
| 4 | P0 | Honesty | README and Devpost say "works offline", but there is no service worker. That claim was false. |
| 5 | P1 | Privacy/copy | The notes field is labelled "(private notes)", but the parent update quotes those notes word for word. The "Turned around" line also pastes a raw struggle note in quotes. |
| 6 | P1 | Bug | Editing a session whose student is archived silently reassigns it to another student, because the select only lists active students. |
| 7 | P1 | Bug | `#invoices/<unknown id>` throws (`inv` is null) and leaves a blank page. |
| 8 | P1 | Data | "Restore backup" overwrites everything with no confirmation. Import only checks field presence: no type checks, orphan sessions are kept, and the error message is a raw JSON.parse one. |
| 9 | P1 | NLG | Sentiment uses substring matching ("hard" matches "hardly", "great" matches "greater") with no negation ("not confident" counts as positive), and "needs" and "review" double-count. |
| 10 | P1 | A11y | axe flags 13 **critical** `label`/`select-name` violations (Students, Parent updates, Invoices, Settings forms), 4 **serious** contrast failures (amber `#d97706` and green `#059669` on white, under 4.5:1), and empty table headers. `aria-live` on the whole `<main>` makes screen readers re-read the page on every click. There's no skip link, no `aria-current`, no focus management on route change, and "Restore backup" is a `<label>` that keyboard users can't reach. |
| 11 | P1 | Mobile | 177px horizontal overflow on Dashboard and Service hours (7-column table). The nav wraps to 3 rows and pushes content down. |
| 12 | P1 | UX | Before you click Generate, "Copy" copies placeholder text and "Open in email" goes nowhere. The report isn't editable before sending. The default 30-day range hides older sessions with no presets. |
| 13 | P1 | UX | The empty dashboard shows a row of $0 KPIs and a chart of "$0" labels instead of guiding the first-time user. |
| 14 | P1 | UX | "Mark paid", "Mark all paid", delete, and archive have no undo. Archived students can't be restored. |
| 15 | P1 | Business | Payment reminders and goal tracking were only roadmap items, even though "who owes you" is the core pain point. There's no service-hour goal (NHS chapters set hour targets) and no printable log for a sponsor's signature. |
| 16 | P2 | Copy | Plurals ("1 families owe you", "1 volunteer sessions"). The Club plan shows "Pro plan: unlimited". Invoice numbers aren't stable or unique. |
| 17 | P2 | UX | Every render scrolls to the top, even toggling "unpaid" halfway down a table. |
| 18 | P2 | Security | No Content-Security-Policy. Inline `style=""` attributes all over the templates block a strict CSP. |
| 19 | P2 | Demo | Demo shows "Collected $0.00" this month, which looks broken on video. |
| 20 | P2 | Data | Calendar-invalid dates like `2026-02-31` pass validation. There's no multi-tab sync (the `storage` event). |

### Fixed in iteration 1 (all 20 items)
1. Minutes now `min=1 step=1` with quick-duration chips (30/45/60/90), and rates take cents (`step=0.01`). **Added a real-browser e2e test** that clicks Save with the default value, so this can't come back.
2. Unreadable saved data is parked under `tutorloop.v1.unreadable.<time>` and a banner explains what happened. Save failures show a banner telling the user to download a backup.
3. `csvEscape` prefixes `= + - @ tab CR` cells with `'` (the OWASP CSV-injection guidance), with unit and e2e tests.
4. Added a real service worker (`sw.js`, network-first with a cache fallback), a web manifest, and icons. The e2e test reloads the app with the network turned off.
5. The notes label and help text now say notes can be quoted in parent updates. The update is an editable textarea, and resolved struggles are summarised ("earlier challenges are turning around") rather than quoted.
6. The session editor always includes the session's own student, marked "(archived)" when archived.
7. Unknown invoice ids fall back to the student with the largest balance and show a notice.
8. Restore asks for confirmation with counts and can be undone. `importState` normalises every field, drops orphan, duplicate, and invalid rows, rejects newer schema versions, and gives friendly errors.
9. Sentiment rewritten: whole-word regex stems, matched spans are blanked out so nothing is counted twice, clause splitting, and negation in both directions ("not confident" is a struggle, "wasn't confused" is progress).
10. Every input has a `<label for>`, colours are darkened to pass WCAG AA (`--warn #b45309`, `--good #047857`, `--muted #4b5563`), empty headers carry sr-only text, `aria-live` is only on the toast, and there's a skip link, `aria-current`, focus moved to the h1 on navigation, and a real button for Restore. **axe-core reports 0 violations on all 7 pages.**
11. Phone layout: the nav is one scrollable row and wide tables stack into labelled rows. **0px overflow on all 7 pages at 390px.**
12. Report presets (last 30 days, this month, last 90 days, all, custom). The update auto-generates on open and when you switch students, the email link uses the edited text, and copy has a fallback.
13. The empty dashboard is now a welcome card plus a 3-step setup checklist, and the chart shows a message instead of $0 bars.
14. Undo toast on every change (snapshot based). Archived students can be restored, still respecting the plan limit.
15. **New:** one-click payment reminders (mailto with an itemised balance), a service-hour goal with a progress bar, a printable sponsor log with a signature line, and "Quick log" (starts from your last session with that student).
16. Plurals fixed, the plan label covers Club, and invoice numbers are `INV-YYYYMMDD-hash`.
17. The page only scrolls to the top when the route changes.
18. Strict CSP meta tag (`default-src 'self'`, no inline script or style). All inline `style=""` removed. The e2e harness confirmed the CSP blocks injected inline scripts.
19. The demo now has a paid October session, so "Collected this month" isn't $0.
20. Calendar-valid date check (`isValidDate`). A `storage` event listener keeps open tabs in sync.

**Tests after iteration 1:** unit 31/31, jsdom 16/16, Playwright e2e 47/47 (flows, offline, keyboard, axe on 7 pages, overflow on 14 page/viewport combos).

---

## Iteration 2 (Oct 10, 2026), fresh review of the iteration-1 build (screenshots inspected)

| # | Sev | Area | Problem |
|---|---|---|---|
| 1 | P1 | NLG | For Maya (last 30 days), the update said she was "working through some challenging material" **and** "earlier challenges are turning around". That's contradictory, because one old two-signal struggle outweighed a newer win. Raw word counts aren't a good trend measure. |
| 2 | P1 | Mobile | Stacked tables on a phone: multi-part cells (name + subject + pill) split into columns because each child became a flex item, and the "Recent sessions" card took 7 labelled lines per session (very long scroll). |
| 3 | P2 | Visual | On desktop, the "Who owes you" pill wrapped onto three lines inside a rounded badge. |
| 4 | P2 | UX | The parent-update textarea had a fixed height, so the balance line was cut off below the fold. |
| 5 | P2 | Copy | Dates had no year, so an invoice or a session from last December read as "Dec 30". |
| 6 | P2 | Visual | Date inputs were taller than selects in the same row on the Log page. |
| 7 | P2 | Tests | The jsdom smoke test only printed output and never asserted anything, so it couldn't fail. |
| 8 | P2 | Tests | Print stylesheets (invoice, sponsor log) were never verified. |

### Fixed in iteration 2
1. The trend is now **recency-weighted session votes**: each session is +1, −1, or 0, weighted by position, and "turned around" takes priority. New unit tests cover a turnaround and a relapse.
2. Phone session lists became compact 3-line cards (student · amount / date · minutes · status / topics · edit). Multi-part cells are wrapped so they stay one block.
3. The pill was replaced with a muted line ("2 unpaid sessions since Sep 29").
4. The textarea auto-sizes to the message.
5. `fmtDate(d, refYear)` adds the year when it isn't the current year. Invoices and printed logs always show it.
6. Inputs and selects now share one height (42px).
7. The jsdom test now has 16 real assertions (routes, plan limit, XSS, persistence, undo, bad ids) and exits non-zero on failure.
8. The e2e test now emulates print media for the invoice and the sponsor log (chrome hidden, signature line visible) and saves print screenshots.

**Tests after iteration 2:** unit 33/33, jsdom 16/16, e2e 50/50.

---

## Iteration 3 (Oct 10, 2026), fresh review of the iteration-2 build (judge + user lens, screenshots inspected)

| # | Sev | Area | Problem |
|---|---|---|---|
| 1 | P1 | Privacy | There was no way to permanently remove one family's data (only archive, or erase everything). Student tutors handle minors' information, so "a parent asks you to delete their kid's records" is a real request. |
| 2 | P1 | Data | A change made in another tab re-rendered this tab and could wipe a half-filled form. |
| 3 | P2 | A11y/UX | The undo toast disappears after 6 seconds, and keyboard users had no fast way to reach it. |
| 4 | P2 | Mobile | The Log page's student select was cut off ("Maya Chen · Alg") at 390px. Compact session cards ran date and minutes together ("Oct 8  90 min"). Volunteer rows showed a stray "-" amount. |
| 5 | P2 | Copy | The plan toast read "Plan: pro" in lower case. |
| 6 | P2 | Honesty/docs | README and Devpost still described the old feature set and test counts (14 tests), listed payment reminders as roadmap (they're now built as one-click; scheduled ones are still roadmap), and said "works offline" without "after your first visit". |
| 7 | P2 | Engineering | No CI and no `.gitignore`. `package.json` didn't list axe-core or a way to run the e2e suite. |

### Fixed in iteration 3
1. Archived students get **Delete** (confirmation, removes their sessions too, and can be undone right after). Covered by e2e.
2. Storage-sync guard: if a form has focus, show a banner instead of re-rendering.
3. **Ctrl/Cmd+Z** undoes the last change when you're not typing in a field. It's single-step, and a second press does nothing (e2e checks both).
4. The student select spans the full row on phones. Compact cards read "Oct 8 · 90 min". The "-" is hidden.
5. The toast now reads "Switched to Pro (demo, no charge)".
6. README rewritten (features, architecture, on-device engine, test matrix, security, scalability with a measured perf number, known limits). Devpost text, judging table, deck slides, video script, and honest notes all updated to match.
7. Added `.github/workflows/test.yml` (unit + jsdom + Playwright e2e), a `.gitignore`, and `package.json` scripts (`test`, `test:dom`, `test:e2e`, `test:all`) with devDependencies on jsdom and axe-core.

**Tests after iteration 3:** unit 33/33, jsdom 16/16, e2e 53/53.

---

## Iteration 4 (Oct 10, 2026): final fresh review

I ran a clean pass on all 7 pages at desktop, phone, and print sizes, from the empty state through the sample data, plus a re-read of README and Devpost for accuracy.

- **P2 (fixed):** on desktop, "Who owes you" wrapped the student's name onto two lines because the three action buttons took the width. The name is now kept on one line, and the buttons can wrap on medium screens.
- No P0 or P1 issues found. Unit, jsdom, and e2e all pass (axe: 0 violations on all 7 pages; overflow: 0px at 1280 and 390; offline reload works; no console errors).

**Known limits (accepted for the hackathon, documented in README):** single-browser storage (backup/restore instead of sync), simulated checkout, English-only rule-based text engine, and reminders open the user's own email app (nothing is sent automatically).
