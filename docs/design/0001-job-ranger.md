# 0001 — Job Ranger

- **Status:** Accepted. Building (step 1 of the build order is PR 1)
- **Date:** 2026-11-17
- **Author:** Jerry Vrabel

## Name

**Job Ranger** (decided 2026-11-17). A ranger scouts ahead, tracks, spots
traps and looks after the people on the trail: finding and ranking jobs,
tracking applications, flagging scams and ghost jobs, on the seeker's side.
"Quartermaster" stays the name of my Party companion in Claude, which uses Job
Ranger through its MCP server. (Quartermaster was set aside as a product name:
several apps already use it, and it says "supplies", not "jobs".) Trademark
and domain checks come before the repo goes public.

## Problem

The Quartermaster today is a Claude Project plus a weekday scheduled task that
writes a report. It doesn't work for the person using it:

- **It isn't simple or focused.** The step-through process is a mess.
- **It argues.** It pushes back on choices that are mine to make.
- **Apply links are missing.** The one thing every posting must have.
- **The company summary is thin,** and the useful facts for a job seeker
  aren't laid out the way I read.
- **It has no memory.** Nothing tracks what I saved, applied to or passed on.

Job Ranger replaces it as a real app. It's also a portfolio gap: I have no shipped feature that calls a model and
measures how well it does.

## What it must be

1. **One screen.** A ranked list of jobs, newest first within each score. No
   wizard, no steps. Everything else is one click away.
2. **My rules are rules.** Hard rules (never Agile Six; Drupal last; mission
   and values rank, they don't gate) live in code and are tested. The model
   judges fit; it never overrides a rule and never argues with a decision.
3. **Every job has its apply link,** taken straight from the employer's job
   board, never written by a model. No link, no listing.
4. **A card I can read at a glance:** title, company, remote or location, pay
   if posted, posted date, the apply link, a one-line "why it fits" tied to my
   rules, and a short company summary with its sources.
5. **Tracking:** new → saved → applied → interviewing → offer, or passed or
   closed, each with a date and a note.
6. **It never writes application answers.** It finds, ranks and tracks. I
   write (some employers, like Exygy, forbid AI-written answers).

## Accessibility

WCAG 2.2 AA is the floor, and it is built for someone tired or worn down by a
long search: small steps, clear words, nothing punishing.

- **Keyboard first.** Every action (open, save, apply, pass, change status,
  undo) works from the keyboard, in a sensible order, with a visible focus.
  After a status change, focus stays where the person is.
- **Never color alone.** A score is a number and a word ("Strong fit"), a
  status is its name, and a rule that ruled a job out says so in words.
- **Screen readers:** each job card is a heading with its details under it,
  every control's name matches what it shows, and status changes are
  announced.
- **Plain language.** Reasons and summaries are short and plain, and an eval
  checks their reading level, so "why it fits" stays readable.
- **Forgiving.** Passing on a job can be undone. Nothing is deleted in one
  click, and there are no streaks, timers or guilt.
- **Reflow and motion:** works at 200% zoom and on a phone without sideways
  scrolling; reduced motion is respected.
- **Tested, not promised:** axe checks in Playwright on every page in CI,
  keyboard-path tests for the main flows, and a manual screen reader pass
  before each release.

## How it works

- **Sources:** public job-board APIs that many employers use (Greenhouse,
  Lever, Ashby), read per company on a daily schedule. They return structured
  postings with real apply URLs. Companies are a list I keep. (To verify in
  the first PR: each API's current endpoints and terms.)
- **Dedupe and freshness:** a posting is keyed by its board and id. Closed
  postings drop off; a posting I've seen never shows as new again.
- **Ghost-job warning:** a posting that has stayed open a long time, or keeps
  being reposted, is flagged in words ("Open 47 days, reposted twice"), with
  the facts it's based on. It's a warning, not a verdict.
- **Scoring:** code applies the hard rules first. Then the model scores fit
  against my profile and returns structured output: a score, the reasons, and
  which rule or preference each reason comes from.
- **Company summary:** written by the model only from the posting and the
  company's own pages, with a source link for each fact. Anything it can't
  source, it leaves out.
- **MCP:** a small server so the Quartermaster Project in Claude can ask for
  today's top jobs and mark one saved or applied.

## Evals and observability (the portfolio point)

- **Labels come from use.** Every time I save, apply or pass, that's a
  labelled example. Overriding a score is a label too.
- **The eval suite** runs the scorer against those labels and a fixed set of
  postings. It measures how good the top ten are, checks that no hard rule is
  ever broken (must be zero), and checks that every summary fact has a source.
- **Every run is traced:** prompt version, model, tokens, cost, time and
  score, stored and shown on a page that compares prompt versions over time.
- **A spending cap in code,** so a bad loop can't run up the bill.
- CI runs the normal tests on every PR. The model evals run on a schedule and
  on demand, since they cost money.

## Why build one when the market is full of them

It is crowded: trackers (Teal, Huntr), auto-apply tools (Simplify, AIApply,
LazyApply) and matchers (Jobright). This isn't meant to compete with them.

- **It's a portfolio piece judged on its engineering:** a model with real
  evals, rules in code, tracing, accessibility tested in CI. Nobody hires for
  an original job tracker; they hire the person who can show how they know
  the model is right.
- **It's built for its user,** who is me, and who knows hiring from the
  recruiter's side.
- **Where it differs, it can show it:** no auto-apply and no AI-written
  answers; hard rules that are never argued with; apply links always from the
  source; ghost-job warnings with their facts; and accessibility as a tested
  requirement.
- **The README leads with the evals and accessibility,** not "a job app", so
  a reviewer sees the point in the first screen.

## What sets it apart: on the job seeker's side

The crowded tools optimise for volume (apply to more jobs) and subscriptions.
What job seekers actually struggle with is trust: fake jobs, ghost jobs,
missing pay, silence after applying, and tools that bill them after they
cancel. Each feature below answers one of those, and shows its evidence.

1. **Honest signals, with the facts behind them.**
   - _Ghost-job warning:_ open a long time, or reposted (see How it works).
   - _Scam check:_ apply link on a different domain than the company's
     board, a "recruiter" email on a free domain, pay-to-start or equipment
     checks, text-message-only contact. Each flag says what it saw.
   - _Pay missing where the law may require it:_ a posting for a role in a
     state with a pay-range law (Illinois among them) that lists no range is
     flagged, with a link to the state's rule. Information, not legal advice.
2. **Scores you can check.** Every score shows its reasons, and the eval
   results are published in the repo. Other tools show a "98% match" with no
   way to know what it means.
3. **A tracker that knows about ghosting.** Gentle follow-up reminders at
   sensible intervals; after a set time with no reply, a job moves to "No
   reply" on its own, so I can stop waiting. Over time it shows how each
   company I've applied to actually responds.
4. **Calm by design.** One screen, plain words, no streaks, no pressure to
   apply more, accessible and tested (see Accessibility).
5. **No dark patterns.** No auto-apply, no AI-written answers, no
   subscription. My data stays mine: export everything, delete everything.
6. **A recruiter's eye (later).** Read a posting the way a recruiter does:
   must-haves apart from the wish list, each quoted from the posting, with a
   faithfulness eval.
7. **Age-aware (later).** Flag age-coded language in a posting ("digital
   native", "recent grad") in words, with the phrase quoted. Older job
   seekers widely report age bias; no mainstream tool helps them see it.

## Testing

The same bar as my other projects: nothing is done until lint, strict types,
formatting, unit tests, coverage floors and the browser suite all pass in CI.

- **Unit tests for the rules** (pure core): hard rules, dedupe, ghost-job,
  scam and missing-pay checks, the "No reply" timer, follow-up timing. Every
  flag has tests for when it fires and when it must not.
- **Property-based tests** where inputs vary: dedupe is idempotent, a posting
  never appears twice, odd or hostile posting text never crashes a check or
  leaks into the page as markup.
- **Source contract tests:** each job-board API is tested against recorded,
  real-shaped responses (no live calls in CI), including missing fields, a
  missing apply link (the posting is dropped) and a changed format (fails
  loudly).
- **Worker and database tests** in the Workers runtime against the real
  migrations: the daily fetch, tracking, and the spending cap.
- **Time-based tests** with a fake clock: posting age, "No reply", reminders.
- **Model calls in CI are stubbed** with recorded responses, and every
  response is validated against its schema; a bad response is rejected, not
  shown.
- **Browser tests** (Playwright) on desktop, Android and iPhone, with axe on
  every page, keyboard paths for the main flows, 200% zoom and real-sized
  data (long titles, many jobs).
- **Security tests:** the private pages fail closed without sign-in, CSP and
  security headers, and no personal data in logs.
- **MCP tests:** each tool's inputs are validated and its outputs checked.
- **Coverage floors** enforced in CI, aiming for 100% like the other repos.
- **Evals are a separate gate.** They run on a schedule and on demand. A PR
  that changes a prompt or the scorer must include an eval run that shows no
  rule violations and no drop in quality; results are kept by prompt version.
- **Honest signals get their own eval:** a labelled set of real-looking
  scams, ghost jobs and legitimate postings, tracking false alarms as well as
  misses, because a tool that cries wolf stops being trusted.
- **Before each release:** a manual screen reader pass and a look on a real
  phone. What wasn't checked is said in the PR.

## Options

**A. All TypeScript (recommended).** SvelteKit on Cloudflare (Workers, D1,
cron), with the scorer, evals and MCP server in the same repo. One stack I
already know well, adds SvelteKit, and keeps CI, deploys and reviews simple.

**B. SvelteKit plus a Python scorer.** SvelteKit front end; scoring and evals
in a FastAPI service on Cloudflare Python Workers, like Quest Log Insights.
Shows Python on the AI side, but two deploys, two test setups and a network
hop between them.

**Choice:** A. Python is already shown in Quest Log Insights; the gap this
project closes is the model with evals, not the language.

## Not solo

The repo opens with a CONTRIBUTING guide, labelled starter issues and the same
PR and CI process as my other projects, so a second contributor can join. That
shows the team side of how I work, not just the code.

## Build order

1. Tooling and CI only: SvelteKit, strict types, lint, tests, Playwright with
   axe (failing the build on any violation, from the first page), coverage
   floors, and the test layout above.
2. Sources: one job-board API, dedupe, the daily fetch, the list page with
   apply links.
3. Hard rules in code, and tracking (saved, applied, passed), with the
   "No reply" timer and follow-up reminders.
4. Honest signals: ghost-job, scam and missing-pay flags, each with its
   evidence and its own tests.
5. Model scoring with reasons, and tracing.
6. The eval suite, the eval page, and published results.
7. Company summaries with sources, and their faithfulness eval.
8. The MCP server.
9. Later:
   - **Paste to check:** paste any posting or message (a Discord post, a
     Telegram or LinkedIn DM) and get the same checks, and save it.
   - **Developer-scam rules:** flag a request to install a "meeting app" or
     to run a repo as a take-home test, the pattern behind wallet-draining
     web3 job scams.
   - **A fediverse source:** follow #FediHire and similar hashtags, resolve
     each link to the employer's real job board, and run the usual checks.
   - **Discord right-click:** a message context menu command ("Check with Job
     Ranger"), which needs no privileged access. Never a self-bot: Discord
     bans them. How it's installed is checked in its own PR.
   - **The recruiter's eye** and **age-aware flags.**
   - Not a source, on purpose: the dark web. Its job market is almost all
     crime, and searching it would contradict the scam checks.

## What would change our mind

- If the job-board APIs don't cover the companies I target, add a source that
  reads a posting page I paste in, rather than scraping.
- If model cost or quality disappoints, keep the hard rules and tracking and
  score with a simpler, cheaper model, with the evals telling us which.
