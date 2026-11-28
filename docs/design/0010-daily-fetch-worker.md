# 0010 — The daily fetch in its own Worker

- **Status:** Proposed
- **Date:** 2026-11-28
- **Author:** Jerry Vrabel

## Problem

The daily fetch and scoring run on a cron in the same Worker as the app.
That Worker's entry point is our own `worker/index.js`, which takes
SvelteKit's `fetch` handler from the adapter's output and adds `scheduled`.

The Cloudflare adapter is held at 8 (#71) because adapter 9 breaks this.
Version 9.0.1 (checked 2026-11-28 in the published package):

- writes its own Wrangler config next to its Worker, with `main` set to its
  own `index.js`, and points `wrangler deploy` at that config
  (`.wrangler/deploy/config.json`), so our `main` is ignored;
- generates a Worker that exports only `fetch`.

So upgrading would deploy without errors, and the daily fetch would stop
without saying so. Its `worker` option only switches the Worker on or off;
it doesn't take extra handlers. (A proposal to add that, sveltejs/kit
#13739, isn't in the released package.)

Every adapter release we skip makes the eventual upgrade bigger, and the
hold also blocks other dependency updates that require adapter 9.

## Goals

- **The app follows the adapter's supported path,** with no custom entry
  point, so adapter upgrades are ordinary Dependabot bumps again.
- **The daily fetch and scoring keep working exactly as now,** from the
  same tested code (`src/lib/server/scheduled.ts`), on the same schedule.
- **No run is lost or doubled** at the switch-over.
- **Nothing new is reachable from the internet.**

## Not goals

- Changing what the daily fetch or scoring does.
- Alerts when a run fails (0009 item 11). This makes them easier to add
  later, since the cron's logs become their own Worker's logs.

## Options considered

**A. A second Worker that only runs the cron (chosen).** A small Worker,
`job-ranger-daily`, with its own Wrangler config (`cron/wrangler.jsonc`)
and entry point (`cron/index.ts`) that exports only `scheduled`, calling the
same `scheduled()` the app uses today. It binds the same D1 database and
has the cron trigger. It has no `fetch` handler, no `workers.dev` address and
no route, so nothing can reach it from outside. The app Worker becomes
exactly what the adapter builds.

- For: works with adapter 8 and 9 and any later version; uses only
  Cloudflare's documented setup; the app and the scheduled work can each be
  read, deployed and logged on their own.
- Against: two Workers to deploy (one more command in `npm run deploy`); the
  model settings and key that scoring uses (`ANTHROPIC_API_KEY`,
  `SCORE_MODEL`, `SCORE_DAILY_CAP_USD`) must be set on the cron Worker too,
  since "Score now" and drafting still run in the app. Rotating the key means
  setting it in both.

**B. Patch the adapter's output after the build** to add `scheduled` to its
generated Worker, as some community plugins do. One Worker, but it depends
on the adapter's file layout and generated code, which is exactly what
changed between 8 and 9. The next change would break it the same way.

**C. A fork of the adapter that supports extra handlers**
(`@joshthomas/sveltekit-adapter-cloudflare`). One Worker, supported shape,
but it puts a one-person fork between us and every SvelteKit release.

**D. Deploy with our own config, bypassing the adapter's redirect**
(`wrangler deploy -c wrangler.jsonc`, with `worker/index.js` importing
adapter 9's new output path). The smallest change, but it relies on where
adapter 9 puts its files and works against the way the adapter means to be
deployed. `vite preview` and the adapter's local platform would still use
the adapter's config, so local and deployed setups would differ.

**E. Stay on adapter 8.** No work now; the debt grows, and eventually a
security fix arrives that needs 9.

**Choice: A.**

## Design

- `cron/index.ts`:
  `export default { scheduled: (controller, env) => scheduled(controller, env, fetch.bind(globalThis)) }`.
  The logic stays in `src/lib/server/scheduled.ts`, already tested.
- `cron/wrangler.jsonc`: `name: "job-ranger-daily"`, the same
  `compatibility_date` and flags, the same D1 binding (`DB`, same database
  id), `triggers.crons: ["23 11 * * *"]`, `workers_dev: false`,
  `preview_urls: false`, observability on. No `assets`, no routes.
  Migrations stay with the app's config, so they're applied once.
- The app's `wrangler.jsonc`: `main` becomes the adapter's output, the cron
  trigger is removed with an explicit `"triggers": { "crons": [] }` (an
  absent `triggers` may leave the old schedule in place), and
  `worker/index.js` and `sveltekit.wrangler.jsonc` go.
- `npm run deploy`: build, apply migrations, deploy the app, then deploy the
  cron Worker (`wrangler deploy -c cron/wrangler.jsonc`).
- **Switch-over:** one release does both. The app loses its trigger and the
  cron Worker gains it within the same deploy, seconds apart, far from
  11:23 UTC. If the second deploy fails, the next run is missed, not doubled;
  the deploy output says which step failed, and re-running the deploy
  finishes it.
- **Secrets:** before that release, Jerry sets the scoring settings on the
  cron Worker (`wrangler secret put … -c cron/wrangler.jsonc`), but only if
  they're set on the app (today they aren't: no key yet).
- **CI:** a step bundles the cron Worker without deploying
  (`wrangler deploy --dry-run -c cron/wrangler.jsonc`), so a broken import
  fails the PR, not the release.
- **Tests:** a unit test that `cron/index.ts` passes the controller, env and
  `fetch` through to `scheduled()`; the existing `scheduled` tests stay as
  they are.

## Build order

1. **This note.**
2. ~~**The cron Worker, while still on adapter 8:**~~ _Built._ Adds
   `cron/`, moves the trigger, updates `npm run deploy` and CI. Released on its
   own, so a problem is about the move, not the upgrade. The dry run bundled it
   at 64 KB with the `#lib` imports and price table resolved, and run locally
   (`npm run fetch:local`) it read the app's own local database. Still to check
   after release: the old trigger gone from the app, and the next morning's run
   in job-ranger-daily's logs, before going on.
3. **Adapter 9:** remove `worker/index.js` and `sveltekit.wrangler.jsonc`,
   point the app at the adapter's output, drop the Dependabot hold. Full
   browser suite, then a release.

## To check while building

- That Wrangler's bundler resolves our `#lib/...` imports and the JSON
  price table from `cron/index.ts` (the dry run will show it).
- That an empty `crons` list removes the app's old trigger (the
  Cloudflare dashboard's Triggers tab will show it).

## What would change our mind

If a released adapter gains a supported way to add `scheduled()` to its
Worker, we'd fold the cron back into one Worker on that.
