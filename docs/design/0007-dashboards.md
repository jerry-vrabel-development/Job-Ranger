# 0007 — Dashboards: my search, the companies, the market

- **Status:** Accepted. Part 1 (My search) built
- **Builds on:** [0002](0002-connectors-company-insight-dashboards.md) (dashboards and
  company insight), [0005](0005-honest-signals.md), [0006](0006-tracking.md)

## Problem

Job Ranger knows a lot that I can't see at a glance: how my search is going,
which companies are hiring more or less, what the jobs I watch look like
together, and what each company is like. Today that's spread across lists.
0002 set the rules for dashboards; this note decides what to build first,
from what data, and how.

0002 placed dashboards after scoring and evals. I'm moving them up: they're
what I most want to use day to day, and almost everything they need is
already recorded.

## Goals

- **See it at a glance, check it in detail.** Each view leads with a chart
  and a one-line summary in words, with the numbers in a plain table.
- **Honest.** Real counts, the time span said, and "not enough data yet"
  instead of a trend drawn from three points. A fall in open jobs is shown
  as what it is, never called a layoff.
- **Accessible** (0002): never color alone, keyboard-reachable, a table and
  summary for every chart, motion only when reduced motion is off, light
  and dark from one tested palette.
- **Calm** (0002): no streaks, no nudges, no "apply more". Closed
  applications count as replies, not failures.

## Not goals

- Predictions. Trends describe what happened.
- A chart library. See Design.
- Layoff data in the first PRs. It needs research first (see Layoffs).

## What the data can show today

| View               | Comes from                                                      | Enough data yet?                          |
| ------------------ | --------------------------------------------------------------- | ----------------------------------------- |
| My search          | `postings`, `job_marks`, `applications` (status, dates)         | Yes, though few applications so far       |
| Hiring momentum    | `board_counts`: open jobs per company per day, since Nov 20     | A week of counts by Nov 27; 30 days later |
| The market I watch | `postings`: company, source, workplace, pay, first seen, closed | Yes                                       |
| Signals and costs  | the 0005 signals, worked out on load; `draft_costs`             | Yes                                       |
| Company summary    | all of the above, for one company                               | Yes, from my own data                     |
| Layoffs            | Nothing yet: needs an outside source                            | No                                        |

No new tables for the first PRs: every view is a query over what's already
stored, worked out when the page loads, like "No reply" in 0006.

## Design

### Where it lives

- **Insights** page in the main menu, one section per view, in this order:
  My search, Trending companies, The market I watch, Signals and costs.
- **Company page** (`/companies/[source]/[board]`), linked from the
  Companies list and from each job card: the company summary.

### The views

**My search** (built). How many jobs were found and are open, then the
funnel: saved → applied → replied → interviewing → offer, each step a count
with the share of the step before. Found is a number above the funnel, not
a bar: it's hundreds where the rest are a handful, and as a bar it would
shrink them to slivers. Each step counts what got at least that far:
saved includes jobs applied to without saving; replied means interviewing,
an offer or a rejection (a rejection is an answer); withdrawn isn't counted
as a reply, since the record doesn't say whether they'd answered. Beside
it: follow-ups due, waiting, and no reply (0006). Counts below 5 show the
numbers but no percentages. Median days to a reply waits for a status
history: only the latest status date is stored, so today it would measure
the latest answer, not the first.

**Trending companies (hiring).** For each watched company: open jobs now,
change over 7 and 30 days, and a small line of daily counts. Sorted by
change, with the label in words and a symbol, never color alone:
"↑ Growing: 62 → 75 open (+13) in 7 days". A change needs both a minimum
size (3 jobs or 10%, whichever is larger) and at least 7 days of counts,
or it's "Steady" or "Not enough data yet". Days with a failed fetch are
gaps, not zeros.

**The market I watch.** Open jobs by company, by source, and by remote,
hybrid or on-site; how many post pay; new and closed jobs per day.

**Signals and costs.** How many open jobs carry each 0005 flag, and the
drafting cost per application and in all (from `draft_costs`).

**Company summary.** One page per company, every fact with its source and
date (0002): open jobs and their momentum chart, jobs closed and reposted,
how many I saved, passed and applied to, where those applications stand,
its signals, and its interests. A model-written outlook comes later, with
the faithfulness eval 0002 describes.

### Layoffs

0002 names state WARN notices as the source. They're public, but every
state publishes differently (spreadsheets, PDFs, web tables), names
companies inconsistently, and lags by weeks. Before building, a short
research step answers: which states my companies report in, whether those
states offer files a fetch can read reliably, and how to match names
without false matches. Until then a company summary can hold a layoff note
I add by hand, with its link and date. Review sites and aggregators
without an API stay out (0002: no scraping).

### How charts are built

- **Small Svelte SVG components** (bar, line, funnel) instead of a chart
  library: a few kilobytes, no CSP exceptions, and full control of the
  accessible markup. Scales and data shaping are pure functions with unit
  tests, like the rest of `src/lib`.
- Every chart is a `<figure>` with a `<figcaption>` summary, labels on the
  bars and lines themselves (no legend to decode), and a "Show the numbers"
  table that's also there without JavaScript.
- One palette, checked for contrast in light and dark and for color-blind
  separation, defined once as CSS variables.
- Motion in CSS (bars grow in), off under `prefers-reduced-motion`; it needs
  no JavaScript, so the page reads the same without it.
- Days work like the rest of the app: counted in UTC (the daily fetch runs
  at 11:23 UTC, early morning in Chicago, so each count is one fetch), and
  dates shown in Chicago time.

## Build order (one small PR each)

1. ~~Chart parts (funnel, table, palette) and **Insights** with **My search**.~~ Built.
2. **Trending companies (hiring)**, plus a small trend line on the Companies list.
3. **The market I watch.**
4. **Signals and costs.**
5. **Company page** with the summary from my own data.
6. Layoffs research, then a design addition before any code.

Each PR: unit tests for the shaping functions at 100%, worker tests for the
queries, and browser tests with axe for the page, including keyboard use,
dark mode and reduced motion.

## Options considered

- **A chart library** (LayerChart, Chart.js and others). Faster to start,
  but heavier, harder to make fully accessible, and canvas-based ones need
  their own text fallback anyway. Rejected for now; revisit if the custom
  parts grow past a few hundred lines.
- **Store daily summaries in new tables.** Not needed at this size; queries
  on load can't go stale. Revisit if a page gets slow.
- **Build layoffs first.** It's the least certain data; better to show
  hiring momentum from data I already trust.

## What would change our mind

- If queries on load get slow as history grows, add summary tables written
  by the daily fetch.
- If WARN data proves too uneven to match reliably, keep layoffs as notes I
  add by hand.
