# 0011 — Knowing when the daily run breaks

- **Status:** Proposed
- **Date:** 2026-11-28
- **Author:** Jerry Vrabel

## Problem

The daily run (job-ranger-daily, design note 0010) fetches every board and
then scores new jobs. When it fails, nothing tells me. Today I'd only find out
by opening the Cloudflare dashboard and reading its logs, or by noticing that
the Jobs page's "Last checked" date is old.

It can fail in ways the app can't see now:

- **It never runs.** The trigger is missing after a deploy, the Worker failed
  to deploy, or Cloudflare doesn't fire it. Cloudflare has had incidents
  where new or recently changed cron schedules didn't run, and ours was
  created on 2026-11-28.
- **It starts but doesn't finish.** A database error or a crash part way
  through, or the run is cut off at its 15-minute limit.
- **It finishes, but scoring stopped on an error:** a refused key, a rate
  limit, or the provider being down. Those are in the logs only.

What the app already shows: on Jobs, "Last checked" (the newest board fetch)
and "N boards couldn't be read in the last check"; on Insights, scoring costs.
A board that fails is covered. A run that fails, or never happens, isn't.

0009 item 11, "It says when it breaks": a failed daily fetch two days
running, or scoring that hits errors, shows on the home page, not just in the
logs. It's part of being ready to rely on Job Ranger.

## Goals

- **A missed, unfinished or failed run is shown in words** on the Jobs page,
  the page the phone app opens to, the next time I look. Nothing to remember
  to check.
- **A missed run is noticed too**, not only a failed one: the alert comes
  from the record a run leaves behind, so a run that never happened leaves
  nothing, and that absence is the signal.
- **A short history** of recent runs, so I can see whether a failure is a
  one-off or a pattern.
- **Counts and our own words only:** no company names, no provider responses,
  no key. The same rule as the logs.

## Not goals

- Email or push notifications, for now. Email arrives with 0002; push needs
  a service worker the phone app doesn't have. Both, and options B and C
  below, can build on the record this note adds.
- Alerts about a single board (already shown on Jobs).
- Uptime monitoring of the app itself (Cloudflare Access sits in front; if
  the app is down, I see that when I open it).

## Options

Three ways to hear about a broken run. They aren't rivals: A comes first, and
B and C can be added beside it later.

**A. The run writes a record; the app reads it (now).** A `runs` table in
D1. The run writes a row when it starts and fills it in when it finishes.
The app reads the newest rows and decides, in code, whether something is
wrong: no finished run in the last 26 hours, a run that started but never
finished, or scoring stopped on an error.

- For: no new service, account or secret; the same database the app already
  reads; it catches a run that never happened, because the reader is the
  app, not the run; tested like the rest of the code.
- Against: I only learn about a problem when I open the app. For a job
  search I open most days, that's soon enough until email exists.

**B. A heartbeat service (later)** (a "dead man's switch"): the run pings an
outside monitor at the end, and the monitor emails me when a ping doesn't
arrive.

- For: tells me even when I don't open the app, which A can't.
- What it takes: another account, a URL that's effectively a secret (stored
  as a Worker secret), and an outgoing call at the end of the run.

**C. Cloudflare's own alerts (later, to look into).** Cloudflare's dashboard
keeps the last 100 cron invocations (Settings → Trigger Events) and has
Workers Logs. I didn't find a notification that fires when a scheduled run is
missed; that's worth checking in the dashboard itself, since its features
change. Alerts set up there live outside the repo and its tests, so they'd
be written down in the README.

**Now: A.** Nothing new to run or pay for, it catches the missed run, and
it's the record that email (0002), B or C would build on.

**Later: B and C.** Not ruled out, just not in this piece of work. They add
the one thing A can't: hearing about a problem when I'm not in the app.

## Design

### 1. The record (migration 0022)

Table `runs`, one row per scheduled run:

- `id` (integer key), `scheduled_at` (the run's scheduled time),
  `started_at`, `finished_at` (null until it finishes).
- Fetch counts: `boards`, `boards_ok`, `boards_failed`, `added`, `closed`,
  `deferred` (the existing `FetchSummary`).
- Scoring: `scoring` (`off`, `ran`, `failed`), `scored`, `unscored`,
  `waiting`, `spent_micros`, `stopped` (`cap`, `time`, `error` or null).
- `problem`: a short sentence in our own words, or null. Set when the run
  throws, or when scoring stopped on an error ("Scoring failed. The API key
  was refused (401)."), using the words the scorer already gives.

Rows older than 90 days are deleted by the run itself.

### 2. Writing it (`scheduled.ts`)

- At the start: insert the row with `scheduled_at` and `started_at`.
- After the fetch: write its counts, so a crash during scoring still leaves
  them.
- After scoring (or when it's off): write the scoring fields and
  `finished_at`.
- If anything throws: write `problem` and `finished_at` in a `catch`, log the
  same counts, then rethrow, so Cloudflare still records the run as failed.
  If the database itself is what failed, that write fails too; the row then
  stays unfinished, and the app reports that.

### 3. Deciding what's wrong (`src/lib/runs.ts`, pure)

`runHealth(runs, now)` returns one of these, with words for each:

- **Fine:** the newest run finished within 26 hours with no `problem`.
  Nothing is shown.
- **Not yet:** no runs at all (just after the first deploy). "No daily
  check has run yet. The first is at {time}." ({time} is 11:23 UTC in
  Chicago time: 5:23 a.m. in winter, 6:23 a.m. in summer.) Information, not an alarm.
- **Missed:** the newest finished run is more than 26 hours old. "The daily
  check hasn't run since {date}." (26 hours: one day plus room for a late
  start, so a normal day never trips it.)
- **Didn't finish:** the newest run started more than 20 minutes ago and has
  no `finished_at`. "The daily check on {date} started but didn't finish."
- **Problem:** the newest run finished with a `problem`. "The daily check on
  {date} ran into a problem: {problem}"

Times are shown in Chicago time, written out, never as color or an icon
alone.

### 4. On the page

- **Jobs:** when health isn't Fine, a notice above the list, worded like the
  existing "boards couldn't be read" notice, with what to do next ("Check
  job-ranger-daily's logs in Cloudflare.") and a link to the history.
- **Insights → "Daily checks":** the last 14 runs in a table: date, boards
  read (ok of total), new and closed jobs, scoring (scored, unscored, spent,
  why it stopped), and any problem. A table, so a screen reader reads it row
  by row; no chart.

### 5. Tests

- `runHealth`: every state and the edges (exactly 26 hours, exactly
  20 minutes, no runs, an unfinished run older than a finished one).
- `scheduled`: writes a full row on success; writes the fetch counts and a
  problem when scoring throws; rethrows; the 90-day cleanup.
- Worker tests for the table's reads and writes against real D1; the
  migration test.
- Browser tests: Jobs shows each notice in words from seeded runs; Insights'
  table passes axe.

## Build order

1. **This note.**
2. **The record:** migration 0022, writing it from `scheduled.ts`, the read
   for the app. Deployed on its own, so a few days of real runs exist before
   anything reads them.
3. **What's wrong, and showing it:** `runHealth`, the Jobs notice and the
   Insights table.

Steps 2 and 3 can ship in one release if both are ready.

## Open questions (Jerry)

- 0009 said "two days running". This note shows the first failed or missed
  run, since one missed day already means a day of jobs not checked. Is one
  enough, or should a single failure wait for a second?
- Is 26 hours right, or would you rather hear sooner (say, by 9 a.m.
  Chicago on a day the run hasn't happened)?
- The notice on Jobs only, or on every page?
- Fourteen days of history on Insights, or more?

## When to add B or C

If I go a day or more without opening the app while a problem sits there,
an outside alert (B, C, or email with 0002) moves up the list.
