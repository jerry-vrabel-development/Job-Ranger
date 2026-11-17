# Job Ranger

Job Ranger finds jobs on employers' own job boards, ranks them against rules you
set, tracks every application, and flags likely scams, ghost jobs and missing pay,
each with the evidence behind the flag.

## Status

**Being built.** Working now: a daily fetch from employers' Ashby job boards,
dedupe and closing of postings that leave a board, and a jobs page with each
job's real apply link, all behind sign-in. The rest of the features below are
planned, not shipped yet. The plan is in
[design note 0001](docs/design/0001-job-ranger.md), and how it connects to
email, documents and AI assistants is in
[design note 0002](docs/design/0002-connectors-company-insight-dashboards.md).

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

### The database and the daily fetch

The Worker's entry point is `worker/index.js`: SvelteKit's pages plus the daily
fetch on a cron (11:23 UTC). Job boards are rows in D1, not code, so the list of
companies stays out of the repository.

```sh
npm run db:migrate:local     # set up the local database
# add a company's Ashby board (the name after jobs.ashbyhq.com/, lowercased)
npx wrangler d1 execute DB --local --command \
  "INSERT INTO boards (source, token, company) VALUES ('ashby', 'example', 'Example Co')"
npm run build && npm run preview
curl "http://localhost:4173/cdn-cgi/handler/scheduled?cron=23+11+*+*+*"   # run the fetch now
```

Use `--remote` instead of `--local` for the deployed database.

Adding a dependency: some npm 10 versions fail with "Cannot read properties of
null (reading 'edgesOut')". `npx npm@11 install <package>` works; `npm ci` is
unaffected.

## Branches

feature branch → pull request into `dev` → `dev` → `main` → deploy.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 Jerry Vrabel
