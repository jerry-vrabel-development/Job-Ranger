# 0008 — Scoring jobs with a model, and the evals that check it

- **Status:** Proposed
- **Date:** 2026-11-26
- **Author:** Jerry Vrabel

## Problem

Job Ranger lists about 620 open jobs from the companies I watch, newest
first. It can say which match an interest, but not which fit me. Reading
them all is the slow part of the search, and on a heavy day it doesn't
happen.

It's also the portfolio gap Job Ranger exists to close (0001): a shipped
feature that calls a model **and measures how well it does**. The scoring is
the feature; the evals are the point.

## Goals

- **A fit score I can check.** A number and a word ("4 · Good fit"), with
  the reasons, each traced to something real: a fact I confirmed, an
  interest I set, or words quoted from the posting.
- **Measured, not claimed.** An eval suite says how good the ranking is,
  against my own saves, passes and applications, and the results are
  published in the repo by prompt version.
- **Cheap and capped.** Each job is scored once (again only when the prompt
  or my profile changes), with a daily cap in code.
- **Calm.** Scores rank; they never hide a job. Low scores aren't red, and
  nothing says "you should apply."
- **Model-agnostic.** Through the model module (0004, decision 9); the evals
  decide which model and prompt to use.

## Not goals

- **Rules that remove jobs.** 0001 planned hard rules (never a company,
  Drupal last). I dropped them on Nov 18; none ship. If I want one back, it
  goes in code with tests, applied before the model, never by the model.
- **Scoring for anyone else.** One profile: mine.
- **Live model calls in CI.** CI uses recorded responses; evals that spend
  money run on demand.
- **Predicting whether I'd get the job.** Fit means "worth my time to read",
  not "they'll hire me."

## Design

### 1. What the model sees

- **The posting:** title, company, location, workplace, team, and the
  posting text (cut at 6,000 characters, the cut said in the prompt).
- **My profile:** confirmed facts only (the fact bank, 0004), each with its
  id; my interests (0003), each with its id; and my preferences (below).
  "Your details" (contact info) are never sent, as in 0004.
- **Preferences** (new, a short form on the Facts page): where I'll work
  (remote, hybrid in the Chicago area, on site in the Chicago area), the
  levels I want, a pay floor if I set one, and a free-text "what I'm looking
  for." Optional; empty means "not a factor."

### 2. What the model returns (structured output)

```
{
  "score": 1–5,
  "summary": "one plain sentence: why it fits or doesn't",
  "reasons": [
    { "direction": "for" | "against",
      "text": "plain words",
      "cites": [ { "fact": "f12" } | { "interest": "i3" }
               | { "preference": "location" } | { "quote": "exact words from the posting" } ] }
  ]
}
```

Scores in words: 5 Strong fit, 4 Good fit, 3 Maybe, 2 Weak fit, 1 Not a fit.

### 3. Checked by code before it's shown

The model's answer is a draft; code decides what reaches the page, like the
letter checks in 0004.

- The shape matches the schema; the score is 1–5.
- Every cited fact or interest exists, and facts are confirmed.
- Every quote appears in the posting text, word for word (ignoring case and
  spacing).
- A reason with no valid citation is dropped, and the drop is recorded.
- If no reason survives, or the shape is wrong, the job stays unscored and
  says why; it's never shown a guess.
- The summary and reasons are checked for reading level (aim: grade 8 or
  under), because "why it fits" has to be readable on a bad day (0001).

### 4. When jobs are scored, and what it costs

- **After the daily fetch,** new open jobs are scored, newest first, until
  the day's scoring cap (`SCORE_DAILY_CAP_USD`, default **$0.10**) is
  reached. The rest wait for tomorrow.
- **A score is kept per job, prompt version and profile version.** Changing
  my facts, interests or preferences makes scores "from an older profile":
  still shown, marked, and redone within the cap.
- **"Score now"** on a job scores it on demand (same cap).
- **Estimated cost** with `claude-haiku-5-5` (from the price table: $0.10
  per million input tokens, $0.50 output): a posting plus my profile is
  roughly 3,000–4,000 input tokens and the answer about 300, so about
  **$0.0005 a job**. Scoring all ~620 open jobs once: about **$0.30**. New
  jobs after that (tens a day): about **$0.50 a month**. With
  `claude-sonnet-5-5` it's 20 times that. These are estimates; the traces
  give the real numbers.
- Scoring needs the API key, as drafting does. Without it, nothing is
  scored and the Jobs page says so plainly.

### 5. Traces

Every scoring call is stored (migration 0019, `job_scores`): the job, prompt
version, profile version, model, score, reasons, what code dropped and why,
tokens, cost, time, and when. No posting text or profile text is copied into
the trace; they're already in the database. Logs carry counts only.

### 6. On the page

- **Jobs:** a "Best fit" order next to "Newest" (in the address, like the
  other filters). Each job shows its score as a number and word, and the
  summary. "Why" opens the reasons, each with its source: the fact, the
  interest, or the quoted words.
- **Unscored** jobs say why ("Waiting: today's scoring cap is used",
  "Scoring isn't set up: no API key").
- **Insights → Signals and costs** adds scoring to the costs.

### 7. Evals (the portfolio point)

Run with `npm run eval:score` on my machine, with my key in my shell
(never in the repo or a chat). Results go to `evals/results/` as JSON and a
short Markdown report, committed with the PR that changed the prompt.

- **Labels from use.** Saved, applied, interviewing and offer are "wanted";
  passed is "not wanted". A labelled set is exported from the database
  (`npm run eval:labels`) with posting text, so evals don't depend on jobs
  still being open. Scores I override later are labels too.
- **A fixed set** of made-up postings with known answers, built from my
  profile: clear fits, clear misses, and traps (a perfect title with the
  wrong skills; a dream company with a role far off; a posting that names
  my skills only in a "nice to have" list).
- **What's measured:**
  - **Ranking:** of the jobs I wanted, how many land in the top 10 and top
    25 (recall@k), and NDCG over the labelled set.
  - **Separation:** average score of wanted vs not wanted.
  - **Faithfulness:** share of reasons code dropped (bad or missing
    citations). Target: near zero.
  - **Readability:** share of summaries over grade 8.
  - **Stability:** the same job scored three times; how often the score
    moves by more than 1.
  - **Cost and time:** per job, from the traces.
- **The gate:** a PR that changes the prompt, schema or model includes an
  eval run that shows no drop in ranking or faithfulness against the last
  published run. The eval page in the app shows each published run side by
  side.
- **Honest about size.** With few labels, the numbers are noisy, and the
  report says how many labels each number rests on.

## Options considered

- **No model: keyword matching against my facts.** Free and predictable,
  and already partly there (interests). It can't tell "Python required" from
  "Python nice to have", which is the reading I want. Kept as the baseline
  the evals compare against: the model has to beat it to earn its cost.
- **Embeddings (similarity between my profile and each posting).** Cheap at
  scale, but gives a number with no reasons, and 0001 says every score shows
  its reasons. Maybe later as a first-pass filter if the job count grows a
  lot.
- **Score every job daily.** Simpler, but 30 times the cost for scores that
  don't change.
- **Let the model see "Your details" or my resume as written.** More
  context, but it breaks 0004's rule that only confirmed facts go to the
  model.

## Build order

1. This note.
2. ~~**Score core**~~ (built): prompt builder, schema, the code checks,
   reading level, the keyword baseline, in `src/lib/scoring/`. Tested with
   hand-written answers in the model's shape until real ones are recorded.
3. **Preferences** on the Facts page (migration).
4. **Scoring and traces:** migration 0019, the scorer in the daily fetch
   with its cap, "Score now", costs on Insights.
5. **Jobs page:** "Best fit" order, score, summary, reasons with sources.
6. **Evals:** labels export, the fixed set, `npm run eval:score`, results
   and report, the eval page.
7. **First published run:** Haiku vs Sonnet vs the keyword baseline, which
   decides the default model.

Steps 2–6 work and are tested without an API key (recorded responses).
Step 7 needs the key.

## Open questions (Jerry)

1. **The API key and cap.** Scoring needs the key turned on. Is a $0.10
   daily scoring cap right (about $0.50 a month at the expected rate, $3 at
   most)?
2. **Preferences.** Where I'll work, the levels I want, and a pay floor:
   which of these do I want to set, if any?
3. **Labels.** Few jobs are marked in production yet. Am I willing to save
   or pass, say, 40–50 jobs to give the first eval run enough labels?

## What would change our mind

- If the keyword baseline ranks about as well as the model, ship the
  baseline and keep the model for the reasons only.
- If Haiku's reasons often fail the citation checks, try Sonnet, or a
  two-step prompt (find quotes first, then judge).
- If cost turns out much higher than estimated, score only jobs that match
  an interest.
