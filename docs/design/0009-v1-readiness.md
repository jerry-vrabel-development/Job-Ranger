# 0009 — What v1.0 needs: the big pieces, and being ready to call it a product

- **Status:** Proposed
- **Date:** 2026-11-27
- **Author:** Jerry Vrabel

## Problem

v0.3.0 shipped scoring and the evals (0008, steps 1–7). The roadmap still
has big features ahead, and nothing says when Job Ranger is done enough to
call a product release. Without a list, "v1.0" drifts: either it never
comes, or it comes with its main feature switched off and nobody told when
it breaks.

## Goals

- **One list for v1.0,** in priority order, that every release is planned
  against.
- **The features that make it a product,** and the things that make it
  safe to rely on: it says when it breaks, its data can be restored, it's
  been checked by a person with a screen reader, and someone outside can see
  it.
- **Smoke testing on my phone, early.** I check releases on my Android phone. An
  app I can open from the home screen makes that quick, so it comes first.

## Not goals

- **More users.** v1 stays single-user behind Cloudflare Access (0001). A
  public demo with made-up data is on the list; real sign-ups are not.
- **Dates.** The list has an order, not deadlines.

## The list

Each item becomes one or more PRs. Big items get their own design note
before code. Status words: **Built**, **Next**, **Planned**, **Later**.

### v0.4.0 (proposed)

1. ~~**"Couldn't draft:" fix.**~~ Failed model calls say what failed.
   _Built_ (#98).
2. ~~**Installable on my phone (a PWA).**~~ _Built_ (#99, in v0.3.1);
   installed and working on my Android phone, 2026-11-28. Moved up from "nice to have" because it makes smoke
   testing each release a tap from the home screen.
   - A web app manifest (name, icons, `display: standalone`, theme colors
     for light and dark), app icons made from the favicon, and the Apple
     touch icon and status-bar tags iOS needs (for anyone on an iPhone).
   - **Behind Cloudflare Access:** browsers fetch the manifest without
     cookies by default, so Access would block it. The link needs
     `crossorigin="use-credentials"`. Signing in from the installed app has to be tried on my phone before
     this counts as done.
   - A small service worker only if it earns its place: an "offline" page
     instead of a browser error. No caching of job data, so nothing on the
     phone goes stale or outlives a sign-out. **Built without one:** Chrome
     reports the app installable with no service worker, so none ships
     yet.
   - Done when: installed on my Android phone from Chrome, it opens full screen,
     signs in, and shows the Jobs page.
3. **0008 step 8: the first published eval run.** _Next, needs me._ 40–50
   saved or passed jobs, `npm run eval:labels`, then `npm run eval:score`
   for Haiku and Sonnet; both runs committed and shown on `/evals`. The
   results decide the default model, or whether keyword matching ships and
   the model only gives reasons.
4. **The daily fetch in its own Worker.** _Built:_ design note
   [0010](0010-daily-fetch-worker.md). The cron Worker shipped in v0.3.2;
   the app is on Cloudflare adapter 9 (no longer held at 8, #71).

### The big pieces before v1.0

5. **Email (0002):** replies from employers keep the Tracker current, and
   rejections are filed quietly.
6. **The MCP server and company insight sources (0002):** the Quartermaster,
   or any MCP client, can use Job Ranger directly. Behind OAuth.
7. **Write-together (0004 step 7):** drafting with me, not just for me.
8. **A Workable source** (Movement Labs).
9. **Layoffs (0007 part 7):** deferred on Nov 26; research first.

### Ready to rely on

10. **Scoring switched on.** The key set as a Worker secret, the daily cap
    decided, and the Jobs page ranking real jobs. A v1.0 doesn't ship its
    main feature switched off.
11. **It says when it breaks.** A failed daily fetch two days running, or
    scoring that hits errors, shows on the home page, not just in the logs
    and on the Companies page. _Next:_ design note
    [0011](0011-run-alerts.md).
12. **Backups I've restored from.** A runbook for D1's point-in-time
    restore, one real restore drill, and an export of my tracker, facts and
    answers, so my data is never stuck in the app.
13. **A security review before the MCP server goes live.** A short threat
    model; Access, secrets and CSP checked; dependencies current.
14. **An accessibility pass by a person.** TalkBack on my Android phone and a
    keyboard-only run through the main flows: find a job, save it, apply,
    track it. Axe catches only part of what a person finds.

### For the portfolio

15. **A public demo.** A copy with made-up companies and jobs, and no model
    calls (or a tiny cap), so someone outside can use it. Its own design
    note: what's fake, how it's kept apart from my data, what it costs.
16. **Growth limits.** A retention rule for closed postings and their text
    (say, six months), and the main pages checked at ten times today's data.
17. **The write-up.** README screenshots, an architecture overview, how the
    evals work and what they found, and a short "what v1.0 is, and isn't".

## Options considered

- **A release date, with whatever's done.** Simple, but a date with no list
  ships v1.0 with the risky parts missing (alerts, restores, the security
  review), and those are the parts that make it trustworthy.
- **Features only, readiness after.** Faster to the next feature, but
  readiness work keeps losing to features, and the MCP server shouldn't go
  live before the security review.
- **One prioritized list, features and readiness together (chosen).**

## How it's tracked

The list lives here. A board in Claude and a GitHub Projects board mirror
it for day-to-day use, and the Job Ranger handoff note carries the current
state. When an item ships, it's marked here in the PR that ships it.

## Open questions (Jerry)

1. Is the v0.4.0 cut right: the fix, the phone app, step 8, the daily fetch
   in its own Worker?
2. Scoring on in production: when, and is $0.10 a day the right cap?
3. The public demo: worth a release of its own before v1.0, or after?
