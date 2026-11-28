# Job Ranger

Job Ranger finds jobs on employers' own job boards, ranks them against rules you
set, tracks every application, and flags likely scams, ghost jobs and missing pay,
each with the evidence behind the flag.

**The app:** <https://job-ranger.forwardslash.workers.dev>. It's private:
every page is behind sign-in (Cloudflare Access), and only its owner can
open it. Everyone else sees the sign-in page.

## Status

**Being built.** Working now: a daily fetch from employers' Ashby, Greenhouse, Lever and Breezy job
boards,
dedupe and closing of postings that leave a board, a jobs page with each
job's real apply link and filters (search, company, workplace, new), and a companies page to add (by pasting job-board
links, up to 25 at once), check, rename, pause and remove companies, an interests page to name what
you're looking for (with keywords) and tag companies with it, a Jobs filter
by interest that says why each job matched, a fact bank of everything
true about your work (pasted facts wait to be confirmed), an answer bank
of ready answers to common form questions with a Copy button, an apply kit
per job (the form's questions with your saved answers lined up, an AI-rule
check, and "I applied"), a printable resume per job picked from confirmed
facts, with skills the posting names that you haven't added asked about, not
assumed, cover letter and answer drafts in which every sentence names its facts and
code checks it (answers are kept only once you've edited them), a drafted resume
summary, checked the same way, that goes on the resume only once you choose it, a Review
button that checks your edited summary and answers for the wrong company or role, length and numbers not
in your facts (suggestions only), a ghost-job warning on jobs open 60 days or more or reposted
twice, with the facts behind it, a note when a job posts no pay in a state whose law requires a range
(with a link to the state's rule), a scam check on the posting's text that quotes what it found, Save and Pass on each job (passed jobs
leave the list, with an optional note, and can be put back), a Tracker page with where each application
stands, follow-up reminders at 7 and 14 days and "No reply" after 30, and a daily
record of each company's open-job count, all behind sign-in. The rest of the features below are
planned, not shipped yet. The plan is in
[design note 0001](docs/design/0001-job-ranger.md), and how it connects to
email, documents and AI assistants is in
[design note 0002](docs/design/0002-connectors-company-insight-dashboards.md). Honest signals (ghost jobs,
missing pay, scams) are in [design note 0005](docs/design/0005-honest-signals.md). Tracking is in [design note
0006](docs/design/0006-tracking.md). How applying will work (answers, tailored
resumes and cover letters, never applying for you) is in
[design note 0004](docs/design/0004-applying-resumes-cover-letters.md). The dashboards are in
[design note 0007](docs/design/0007-dashboards.md), and scoring jobs with a model, with the evals that
check it, is in [design note 0008](docs/design/0008-scoring-and-evals.md) (built through v0.3.0). What
v1.0 needs, in order, is in [design note 0009](docs/design/0009-v1-readiness.md).

## What makes it different

- **AI scoring you can check.** A model scores how well each job fits, and every
  score shows its reasons. An eval suite measures the scorer against real,
  labelled decisions, and its results are published here, by prompt version.
- **Your rules are rules.** Hard rules live in code and are tested. The model
  judges fit, and your rules and decisions always stand.
- **Honest signals.** Ghost-job, scam and missing-pay flags, each showing what
  it saw. A signal that cries wolf is measured too.
- **Accessible by design.** WCAG 2.2 AA is the floor, checked with axe in CI on
  every page, with keyboard-path tests on desktop, Android and iPhone.
- **You stay in charge.** You choose where to apply and write your own answers.
  It's free, and your data is yours to export or delete at any time.

## How it's built

I build with an AI pair programmer. Claude drafts code and tests. I set the
direction, review every line, and own what ships. Every change goes through a
pull request, CI (lint, strict types, unit, browser and accessibility tests)
and review before it merges.

- **SvelteKit 3** (Svelte 5) on **Cloudflare Workers**, in strict TypeScript
- **Cloudflare D1** for boards and postings, and a daily **cron** for the fetch
- **Vitest** for unit tests, property-based tests (fast-check), and database
  tests in the Workers runtime against the real migrations, with coverage floors
- **Playwright** with **axe** on desktop Chrome, Android (Pixel 7) and iPhone
  (WebKit)
- **ESLint** (type-aware), **Prettier**, **svelte-check**
- A strict Content-Security-Policy and security headers, tested in the browser

## Running it

Requires Node 22 (see `.nvmrc`).

```sh
npm ci
npm run dev          # local dev server
npm run check        # format, lint, types, unit tests with coverage
npm run test:e2e     # browser tests (first time: npx playwright install)
```

### Deploying

`main` is what's deployed. After a change reaches `main`:

```sh
git checkout main && git pull && npm ci && npm run deploy
```

`npm run deploy` builds, applies any new database migrations, then deploys the
Worker. New code may need its migration, so the migration goes first. The old
code keeps running for a moment against the new tables, so migrations only add
(new tables, new columns with defaults) or rebuild a table with the same
columns, and never break what the running code expects. If a migration fails,
the deploy stops and the old Worker keeps running.

`wrangler.jsonc` names this deployment's D1 database by its ID. If you deploy
your own copy, delete the `database_id` line and the first deploy creates a
database for you. Until sign-in is set up (below), every page answers "Sign-in
is not set up yet".

### Sign-in (Cloudflare Access)

Job Ranger is private: every page and form goes through
[Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/),
and the Worker checks the Access token itself as well (signature, team,
application and an allowed email). Until sign-in is set up, every page answers
"Sign-in is not set up yet", so a first deploy is safe.

On your own machine, let localhost in by creating `.dev.vars` (it's ignored by
git):

```sh
echo 'ACCESS_LOCAL_DEV=true' > .dev.vars
```

That flag only works for `localhost`; the browser tests check that the same
Worker stays closed under any other host name.

To set up Access for the deployed Worker:

1. In the Cloudflare dashboard, open **Workers & Pages**, select `job-ranger`,
   then **Settings** > **Domains & Routes**. For **workers.dev** (and
   **Preview URLs**, if you use them), select **Enable Cloudflare Access**, and
   make the policy allow only your email.
2. Note the **team domain** (`https://<team>.cloudflareaccess.com`) and the
   **AUD tag** it shows.
3. Store them as Worker secrets, so they stay out of this repository:

```sh
npx wrangler secret put ACCESS_TEAM_DOMAIN     # https://<team>.cloudflareaccess.com
npx wrangler secret put ACCESS_AUD             # the AUD tag (comma-separate several)
npx wrangler secret put ACCESS_ALLOWED_EMAILS  # your email (comma-separate several)
```

### On your phone

Job Ranger installs like an app, which makes checking a release on a phone
quick (design note 0009). On Android: open the site in Chrome, sign in,
then **⋮** → **Install app**. On an iPhone: Safari, then Share → **Add to
Home Screen**. It opens full screen on the Jobs page.

Every path is behind Cloudflare Access, so the manifest is fetched with the
sign-in cookie (`crossorigin="use-credentials"`). There's no service worker:
nothing is cached on the phone, so nothing goes stale or outlives a
sign-out. The icons are made from the favicon's shapes by `npm run icons`
and committed.

### Cover letter drafts (Claude API, or another model)

Drafting a cover letter on an apply kit calls the Claude API (Sonnet) from
the Worker. Without a key, everything else works and the kit says drafting
isn't set up. To turn it on:

1. Create an API key in the [Claude Console](https://platform.claude.com),
   and set a monthly spending limit there as a second guard.
2. Give it to the Worker as a secret. Wrangler asks for the value, so it
   never lands in your shell history or the repository:

```sh
npx wrangler secret put ANTHROPIC_API_KEY
```

3. Optionally change the daily cap (default $1.00, in dollars):

```sh
npx wrangler secret put DRAFT_DAILY_CAP_USD   # for example 2.50
```

Drafting goes through a runtime-neutral model module (`src/lib/models/`),
so the provider and model are settings, not code: `MODEL_PROVIDER` (default
`anthropic`) and `DRAFT_MODEL` (default `claude-sonnet-5-5`). Prices live in
`src/lib/models/prices.json`, dated and sourced; only models listed there can
be called, so the daily cap always holds.

Each draft costs about two cents. The kit shows what drafting for each
application has cost and the average per application, so you can set the cap
from real numbers. The model gets the job and the facts
picked for it, never your name or contact details, and every sentence it
writes must name the facts it uses; code checks the draft against them and
lists any problem in words. Postings that forbid AI-written answers are never
drafted.

### The database and the daily fetch

Two Workers share one D1 database. **job-ranger** is the app: SvelteKit's pages
(entry point `worker/index.js`). **job-ranger-daily** (`cron/`) only runs the
daily fetch and scoring on a cron at 11:23 UTC; it has no address, so nothing can
reach it from outside (design note 0010). `npm run deploy` deploys both. Scoring
settings (`ANTHROPIC_API_KEY`, `SCORE_MODEL`, `SCORE_DAILY_CAP_USD`) go on the
daily Worker too: `npx wrangler secret put <NAME> -c cron/wrangler.jsonc`. Job boards are rows in D1, not code, so the list of
companies stays out of the repository. Add companies on the Companies page:
paste links from jobs.ashbyhq.com, job-boards.greenhouse.io, jobs.lever.co or
a company's breezy.hr page,
one per line
(add `, Name` after a link to choose its name), and Job Ranger reads each board
once before saving it.

```sh
npm run db:migrate:local     # set up the local database
npm run build && npm run preview
# then open http://localhost:4173/companies to add a company
npm run fetch:local          # in another terminal: the daily Worker, same local database
curl "http://localhost:4174/cdn-cgi/handler/scheduled?cron=23+11+*+*+*"   # run the fetch now
```

The browser tests that change data (pause, remove) run last, in their own
Playwright project, so they never disturb the others.

### Scoring evals

How well the job scoring works is measured, not claimed (design note 0008).
Two commands, run on my machine:

```sh
npm run eval:labels          # my saved, passed and applied jobs, from production
read -rs ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY   # this terminal only
npm run eval:score           # options: -- --model claude-sonnet-5-5 --repeat 3 --max-usd 1
```

`eval:labels` exports the database to this machine, reads my profile and the
labelled jobs with the app's own code, writes `evals/private/labels.json` and
deletes the export. `eval:score` scores 13 made-up postings (3 times, to check
stability) and the labelled jobs with the model and the keyword baseline,
stopping before a spending cap. A finished run writes a report to
`evals/results/`: numbers and the made-up cases only, safe to commit. Every
call's details stay in `evals/private/`, which git ignores. Committed runs show
on the app's `/evals` page after the next deploy.

Adding a dependency: some npm 10 versions fail with "Cannot read properties of
null (reading 'edgesOut')". `npx npm@11 install <package>` works; `npm ci` is
unaffected.

## Branches

feature branch → pull request into `dev` → `dev` → `main` → deploy.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 Jerry Vrabel
