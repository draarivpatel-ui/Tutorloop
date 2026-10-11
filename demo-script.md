# TutorLoop: demo video shot list and narration

**For:** Next Founders Hackathon (https://next-founders.devpost.com/). The rules ask for "a 5 minute video" covering The Problem, The Build, The Demo, and Scalability, judged 25% each on Technical Execution, Innovation & UX, Business & Finance, and Communication.
**Target length: 4:45.** That leaves 15 seconds of slack under the 5:00 limit. Narration is about 590 words, timed at ~140 words per minute plus a few seconds per demo shot for clicks. If a take runs long, cut the lines marked *(cut if long)* first.

## Before you hit record
1. Open **https://aariv.me/Tutorloop/** in a fresh incognito window so it starts empty. Zoom the browser to 110–125%.
2. Have open in other tabs or windows: the GitHub repo (https://github.com/draarivpatel-ui/Tutorloop) with `js/core.js` visible, a terminal in the repo folder, the README "Scalability" section, and https://aariv.me/Tutorloop/#about.
3. In the terminal, run `npm test` and `npm run test:dom` once beforehand so you know they pass (today: **41 passed**, **19 DOM checks passed**). Only mention the 71-check browser suite if `npm run test:e2e` passes on your machine the day you record.
4. Demo numbers are fixed relative to today, so after **Try it with sample data** you will always see: **$115 unpaid**, **Ethan Brooks owes $90** (2 sessions), **Maya Chen owes $25**, **2.25 of 10 service hours**. The sample data has exactly 3 students, which is the free-plan limit, so adding a 4th shows the upgrade wall.
5. Record with OBS, Loom, or QuickTime. A face-cam bubble in the corner helps the Communication score. Upload to YouTube as **Unlisted**.

## Shot list

| # | Time | Rubric | On screen (shot) | Narration |
|---|---|---|---|---|
| 1 | 0:00–0:17 | Hook | Face cam, or title card: "TutorLoop: the back office for student tutors" + aariv.me/Tutorloop | "Hi, I'm Aariv Patel, a high schooler near Houston. Lots of students at my school tutor younger kids, running it out of a notes app and a Venmo feed. I built TutorLoop: the back office for student tutors." |
| 2 | 0:17–0:52 | **The Problem** | The #about page, scrolled to the three problem cards (Money slips / Parents want updates / Hours need proof) | "Three things break. First, money: after a few weeks you can't remember who paid, and asking a parent for money is awkward. Second, parents: families paying for tutoring want to know if it's working, and writing that every week takes time. Third, proof: volunteer tutoring counts toward NHS service hours, and those need a log a sponsor can sign. Tutoring software exists, but it's built for tutoring companies with staff and budgets, not a sixteen-year-old with three students. That's the gap." |
| 3 | 0:52–1:01 | Demo setup | Click **Dashboard**, then **Try it with sample data** | "Here's the live app at aariv.me slash Tutorloop. I'll load the sample data." |
| 4 | 1:01–1:25 | **The Demo**: dashboard | Dashboard: earnings tiles, $115 unpaid, service-hours bar, 6-month chart, "Who owes you" list | "In one glance I see what I earned this month, a hundred and fifteen dollars still unpaid, and two and a quarter of my ten service hours. Ethan's family owes ninety dollars. One click on Remind writes a polite, itemised reminder with both session dates." *(Click Remind; let the email draft open for one second, then close it.)* |
| 5 | 1:25–1:42 | Demo: log | **Log session**: pick Maya, tap the 60-minute chip, type topics "inequalities", a one-line note, Save. Point at the live amount preview | "Logging a session takes about ten seconds: student, minutes, topics, a quick note. It previews the amount as I type. Save, and I can undo any action." |
| 6 | 1:42–2:11 | Demo: parent update | **Parent updates**: choose Maya, last 30 days, Generate. Highlight the "Overall" and "Highlight" lines, then click into the text to edit one word | "This is the part parents notice. TutorLoop reads my own session notes and writes the update: topics covered, the trend, her latest win, what's next, and her balance. It noticed her word problems went from a struggle to a strength and says they're turning around. I edit it, then one click opens it in my email." |
| 7 | 2:11–2:20 | Demo: invoice | **Invoices**: select Ethan, show the invoice, hover Print | "Unpaid sessions roll into a clean invoice I can print or save as a PDF." |
| 8 | 2:20–2:32 | Demo: hours | **Service hours**: goal bar, volunteer table, CSV export and Print buttons | "Volunteer sessions count separately, toward a goal, and export as a CSV or a printable log with a signature line for my NHS sponsor." |
| 9 | 2:32–2:50 | Demo: business model in the product | **Students**: the "Free plan: 3 of 3" line and the at-limit notice; type a 4th name and Save to show the "Archive one first" toast. Then click **see plans** to show **Settings & plans** | "The free plan covers three students, the whole product. At the limit, TutorLoop points you to the plans. That's the business model, built in. Checkout is a demo for now; no money moves." |
| 10 | 2:50–3:26 | **The Build** | GitHub repo tree → `js/core.js` → `js/app.js` → `sw.js` → terminal running `npm test` (41 passed) and `npm run test:dom` (19 passed) | "Under the hood it's plain HTML, CSS, and JavaScript: no framework, no server, no paid APIs. The key choice is two layers. core.js is pure business logic: money in cents, balances, invoices, CSV export, and the report engine. It never touches the page, so it runs in Node with forty-one unit tests. app.js is a small hash router; every input is escaped, and a strict content security policy blocks inline scripts. A service worker makes it work offline." |
| 11 | 3:26–3:41 | The Build: the "AI" | `progressReport` function in `core.js` | "Parent updates come from an on-device engine. It ranks topics, scores notes for progress or struggle, and weights recent sessions more. It costs nothing per report, and notes about kids never leave the device." |
| 12 | 3:41–4:07 | **Scalability** | README "Scalability" section | "Scaling is cheap by design. Static files on a CDN cost the same for ten tutors or a hundred thousand, and each tutor's data lives on their own device. A test runs five thousand sessions under a strict time budget. For Pro sync, the data maps straight onto three Postgres tables with row-level security, and core.js doesn't change." |
| 13 | 4:07–4:37 | **Business & Finance** | #about page, business-model table (Free / Pro $4 / Club $99) and "Where we are today" | "Freemium: free for three students, Pro at four dollars a month for unlimited, and Club at ninety-nine dollars a school year, so one NHS sponsor brings a whole chapter. After Stripe fees we keep about $3.56 of a Pro month and $95 of a Club year, and hosting costs zero. We have no users or revenue yet. Next: a pilot with student tutors and one NHS sponsor." |
| 14 | 4:37–4:45 | Close | Title card with aariv.me/Tutorloop and the repo URL | "TutorLoop: log it, get paid, keep parents in the loop. Try it at aariv.me slash Tutorloop. Thanks!" |

**Rubric coverage check:** Problem = shot 2. Demo = shots 3–9 (real-time, live URL). Build = shots 10–11. Scalability = shot 12. Business & Finance = shots 9 and 13. Communication = the whole flow, plus face cam.

## Optional cuts if a take runs over 4:50 (do these before anything else)
- Shot 7 (invoice): drop it; invoices are visible on Devpost screenshots.
- Shot 11: shorten to "Parent updates come from an on-device engine; it costs nothing and notes never leave the device."
- Shot 10: drop the canvas chart sentence.

## Things to keep true on camera
- Say "demo checkout" for plan upgrades; no payment is processed.
- One-click reminders are built (they open your email app). Scheduled/automatic reminders, cloud sync, and the Club sponsor dashboard are roadmap. Don't show or imply them as built.
- "Works offline" means after the first visit.
- Sample students (Maya, Ethan, Sofia) are fictional demo data.
- If you interview any real tutors before recording, add one true sentence to shot 2. Don't invent a quote.
