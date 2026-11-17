# Contributing to Job Ranger

Thanks for helping. Job Ranger is built for job seekers, many of them tired or
worn down by a long search, so the bar is: correct, accessible, and honest.

## Before you start

- Read [design note 0001](docs/design/0001-job-ranger.md). Anything bigger than
  a day starts with a short design note in `docs/design/`: the problem, two
  options, the choice, and what would change our mind.
- Look for issues labelled **good first issue**, or open an issue to talk about
  an idea before building it.

## How we work

- **Branches:** branch from `dev`, and open your pull request into `dev`.
  `dev` is released to `main`.
- **Small pull requests.** One complete, tested change beats a big half-done one.
- **A bug fix starts with a test** that fails for the right reason.
- **`npm run check` must pass:** formatting, type-aware lint, strict types, and
  unit tests above the coverage floors. CI also runs the browser tests.

## Accessibility (required)

- WCAG 2.2 AA is the floor. Every page gets an axe check in `e2e/`.
- Everything works from the keyboard, with a visible focus.
- Never color alone: say it in words too.
- Respect reduced motion, and make sure pages reflow at 320 pixels wide.

## Honesty and privacy (required)

- Job Ranger never auto-applies and never writes application answers.
- A flag or score always shows what it is based on. No made-up certainty.
- No personal data in logs, analytics or error messages. No third-party scripts.

## Pull requests

Fill in the template: what changed, why, how it was tested, and what to look at
closely. Say plainly what wasn't checked.
