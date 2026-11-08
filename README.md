# Study Tracker

A self-hosted progress tracker for two study plans:

| Section | Plan | Shape |
| --- | --- | --- |
| **Power BI** | *Power BI Roadmap: Beginner to Industry-Ready* | 100 days across 3 iterations, tracked **day by day** on a calendar |
| **Case studies** | *Sales & Marketing Case Study Study Plan* | 41 cases across 13 weeks in 3 phases, tracked **week by week** on a board |

Every completion, shift and move asks for a **message and a confirmation**, and is written to an
activity log. Admins see all users' changes in a filterable table and can export it as CSV.

## Features

### Power BI (day-wise)
- **Start date → every date.** Pick Day 1 and all 100 days get a calendar date.
- **Calendar view.** A month grid with each day's topic, coloured by status (done, today, overdue, upcoming), with a ⏱ marker on long days.
- **Weekly plan view.** Days grouped into the roadmap's weeks and iterations, each with its exit check.
- **Roadmap strip.** All 100 days as a grid, so you can see where you are at a glance and jump to any day.
- **Day details.** Topics, *Learn* links (Microsoft Learn, SQLBI, dax.guide…), *Practice* task, the daily 1-hour routine and your notes.
- **Shifting when you miss a day:**
  - *Shift…*: move a day N days later or earlier, either **this day and everything after** (completed days stay put) or **only this day**.
  - *Catch up from today*: if you're behind, the first unfinished day moves to today and the rest follow.
  - *Reset shifts*: put every day back on its original date.
- Stats for progress per iteration, the projected finish date and how far it has slipped, and your streak.

### Case studies (weekly, flexible)
- **Start date → week ranges.** Week 1 starts on your date and every week shows its date range.
- **Kanban-style board** with one column per week (or a list view). The current week is highlighted, and weeks with unfinished work are marked.
- **Case shifting:** *Next week* on any card, *Move to week…* from the details panel, or **drag a card to another week**. You can also drop it past the last column to create a new week.
- **Week shifting:**
  - *Roll over*: move **only this week's unfinished cases** forward, e.g. into next week.
  - *Shift weeks*: move **this week and all later weeks** forward or back by N weeks.
  - Completed cases always stay in the week you finished them.
- **Case details.** Story, what to learn, frameworks, the **Read** and **Watch** links, the 4-step method checklist and one-page notes.
- *Reset weeks* puts every case back in its planned week.

### Users, confirmations and admin
- Email and password accounts. Passwords are hashed with bcrypt, and sessions use httpOnly JWT cookies.
- **Every change opens a confirmation dialog** that shows exactly what will change (dates, affected days or cases, the new finish date) and **requires a message**.
- **My activity** lists your own history with search and filters.
- **Admin panel:**
  - Totals for users, changes, changes today, completions and shifts.
  - **The activity log as a table.** Sort by when, user, section or action. Filter by user, section, action and date range, or search messages. Paginated, with **Export CSV**.
  - **Users table.** Shows each user's progress in both plans, number of changes and last activity. You can promote users to admin or demote them.
- Light and dark themes, and the layout works on phones.

### Inspiration
Ideas borrowed from popular planner and productivity tools:
- **Todait / Focusity:** "reschedule the missed work forward" → *Catch up* and *Shift*.
- **Trello / Jira boards:** week columns with drag-and-drop → the case board.
- **Google Calendar month view** → the Power BI calendar.
- **GitHub contribution grid** → the 100-day roadmap strip.
- **Duolingo / Comeback:** streaks → the streak counters.
- **Audit logs in admin consoles** → the admin activity table with CSV export.

## Tech

- **Backend:** Node.js 20+ and Express 5, with SQLite through `better-sqlite3`. The database is a single file, so there is no separate database server to run.
- **Frontend:** React 19 with Vite. The server serves the built app, so the whole thing is **one process on one port**.
- The roadmap content (days, cases, links) is in `server/src/data/*.json` and was extracted from the two PDFs.

```
server/
  src/index.js          entry point
  src/app.js            Express app (API + static client)
  src/db.js             schema, settings, activity logging
  src/auth.js           register/login, JWT cookie, admin bootstrap
  src/routes/           powerbi.js, cases.js, activity.js (incl. admin)
  src/data/             powerbi.json, casestudies.json
  test/api.test.js      API tests (node:test)
client/
  src/pages/            Dashboard, PowerBI, Cases, Activity, Admin, Login
  src/lib/actions.jsx   all confirm+message dialogs
```

## Run locally

```bash
npm install
```

```bash
npm run build
```

```bash
npm start
```

Open http://localhost:3000. **The first account you register becomes the admin.**

For development with hot reload, run these in two terminals:

```bash
npm run dev:server
```

```bash
npm run dev:client
```

Then open http://localhost:5173. Vite proxies `/api` to port 3000.

Run the tests:

```bash
npm test
```

## Deploy

The app is one container with one persistent folder (`DATA_DIR`, holding the SQLite file).
Whatever host you use, **mount a persistent volume at `DATA_DIR`**, or your data is lost when the app redeploys.

### Docker / Docker Compose (any VPS)

```bash
docker compose up -d --build
```

The data lives in the `study-data` volume, and the app is at http://your-server:3000. Put it behind a reverse proxy such as Caddy or Nginx for HTTPS.

### Render

Push to GitHub, then on Render go to **New + → Blueprint** and select the repo. `render.yaml` sets up the Docker service, a 1 GB disk at `/data` and a generated `JWT_SECRET`.

### Fly.io

```bash
fly launch --no-deploy --copy-config
```

```bash
fly volumes create study_data --size 1
```

```bash
fly deploy
```

### Railway or other Docker hosts

Deploy from the `Dockerfile`, add a volume mounted at `/data`, and you're done.

### As a claude.ai artifact (no server)

```bash
cd client && npm run build:artifact
```

This writes `client/dist-artifact/study-tracker.html`, a single page that runs inside claude.ai:
- Sign-in comes from claude.ai, so there is no email or password.
- Data is stored in the artifact's own database, with one record per person plus their monthly activity log.
- The artifact's owner and its Editors get the Admin panel.
- People need Contributor access to save progress.

Publish the page with these capabilities:
- `db`, with rules `progress` and `log` set to read `admin`, write `owner`, and `progress/{self}` and `log/{self}` set to read `view`, write `interact`
- `user`, with scope `profile`
- `downloads`, used for the CSV export

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `./data` (`/data` in Docker) | Where `study-tracker.db` is stored |
| `JWT_SECRET` | auto-generated and stored in the DB | Session signing secret |
| `ADMIN_EMAIL` | none | This email is always an admin |
| `ADMIN_PASSWORD` | none | With `ADMIN_EMAIL`, creates that admin account on boot |
| `ADMIN_NAME` | `Admin` | Display name for the bootstrapped admin |

**Backups:** copy `DATA_DIR/study-tracker.db` (or run `sqlite3 study-tracker.db ".backup backup.db"`).

## How scheduling works

- **Power BI:** `date(day) = startDate + (day − 1) + shift(day)`. Shifting adds to `shift` for the affected, not-yet-completed days. Changing the start date keeps your shifts.
- **Case studies:** each case stores its current `week`, and the date range of week *w* is `startDate + 7·(w − 1)` to `+6`. Moving or shifting changes `week` for unfinished cases only.
- Every change is a row in `activity_log` with the user, section, action, item, a JSON `details` (from → to, how many items moved, the new finish date) and the **message** you entered.

## API (all JSON; mutations require `message`)

| Method | Path | Body |
| --- | --- | --- |
| POST | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | `{name?, email, password}` |
| GET | `/api/powerbi` | |
| PUT | `/api/powerbi/start` | `{startDate, message}` |
| POST | `/api/powerbi/days/:day/complete` and `/uncomplete` | `{message}` |
| POST | `/api/powerbi/days/:day/shift` | `{days, scope: "following" \| "single", message}` |
| POST | `/api/powerbi/catch-up` | `{today, message}` |
| POST | `/api/powerbi/reset-schedule` | `{message}` |
| GET | `/api/cases` | |
| PUT | `/api/cases/start` | `{startDate, message}` |
| POST | `/api/cases/:id/complete` and `/uncomplete` | `{message}` |
| POST | `/api/cases/:id/move` | `{toWeek, message}` |
| POST | `/api/cases/weeks/:week/shift` | `{weeks, scope: "single" \| "following", message}` |
| POST | `/api/cases/reset-weeks` | `{message}` |
| GET | `/api/activity` | your own history |
| GET | `/api/admin/activity`, `/api/admin/activity.csv` | query: `userId, section, action, q, from, to, sort, dir, page, pageSize` |
| GET | `/api/admin/users`, `/api/admin/stats` | |
| PATCH | `/api/admin/users/:id` | `{role}` |
