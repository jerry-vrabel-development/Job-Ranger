# Job Ranger

Job Ranger finds jobs on employers' own job boards, ranks them against rules you
set, tracks every application, and flags likely scams, ghost jobs and missing pay,
each with the evidence behind the flag.

## Status

**Being built.** This repository holds the foundation (tooling, CI, tests and
an accessible starter page). The features below are planned, not shipped yet.
The plan is in [design note 0001](docs/design/0001-job-ranger.md).

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

- **SvelteKit** (Svelte 5) on **Cloudflare Workers**, in strict TypeScript
- **Vitest** for unit tests, with coverage floors
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

Adding a dependency: some npm 10 versions fail with "Cannot read properties of
null (reading 'edgesOut')". `npx npm@11 install <package>` works; `npm ci` is
unaffected.

## Branches

feature branch → pull request into `dev` → `dev` → `main` → deploy.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 Jerry Vrabel
