# 0005 — Honest signals: ghost jobs, missing pay, scams

- **Status:** Accepted. Ghost-job warning and missing pay built; scam checks next
- **Builds on:** [0001](0001-job-ranger.md), roadmap step 4

## Problem

Job seekers lose weeks to postings that were never going to hire, to
postings that hide the pay, and, worst, to scams. Most tools either say
nothing or show a score with no way to check it. 0001 promises signals that
each say what they saw, so I can judge for myself.

## Goals

- **Evidence, not verdicts.** Every flag says what it is in words and the
  facts behind it ("Open 74 days, reposted twice"). It's a warning I can
  weigh, never a hidden filter.
- **Few false alarms.** A signal that cries wolf stops being read, so the
  rules lean cautious, and their misses and false alarms are measured (see
  Evals).
- **Code, not a model.** Every rule is plain code with its own tests. No
  cost, and the same answer every time.

## Not goals

- Hiding or removing jobs. A flag sits on the card; the job stays.
- Legal advice. The pay signal names the law and links to it; that's all.

## What the data can and can't show

Job Ranger reads employers' **own** job boards (Ashby, Greenhouse, Lever,
Breezy), from a list of companies I chose. That changes which signals fit:

- **Ghost jobs fit well.** Each board gives the date a job was first
  published (Ashby `publishedAt`, Greenhouse `first_published`, Lever
  `createdAt`, Breezy `published_date`), and the daily fetch records when a
  job closes and comes back (`reopen_count`).
- **Missing pay fits, with care.** Ashby, Lever and Breezy list pay, so
  "no pay" there means none was posted. Greenhouse's list has no pay at all,
  so its jobs are never flagged from the list alone.
- **Most scam patterns don't apply to these sources.** A fake recruiter
  doesn't post on the real company's Greenhouse board. Scam checks matter
  for postings that arrive another way ("paste to check", 0001's later
  list), and for the posting text on a kit. They come last, built for those.

## Design

### 1. Ghost-job warning (built first)

A posting is flagged when it has been **open 60 days or more**, or has been
**reposted twice or more** (closed and came back on the board).

- **Open since** is the earlier of the board's published date and the day
  Job Ranger first saw it, so a board that resets its date on repost can't
  hide a job's age. The card says which date it used.
- **Reposted** counts only closings the daily fetch saw: a board that
  failed to load never closes its jobs, so a bad fetch can't fake a repost.
- One repost alone isn't flagged: boards close and reopen jobs for ordinary
  reasons. It still shows in the facts once a job is flagged for age.
- Words, on the job card and the kit: "Ghost-job warning: open 74 days
  (since Sep 9, 2026, the board's date), reposted twice. Long-open or
  reposted jobs are sometimes never filled. A warning, not a verdict."

Why 60 days: most roles that are really hiring fill or close within two
months, and a shorter line would flag ordinary slow hiring. The line is a
named constant, and the signals eval (below) is how it gets tuned.

### 2. Pay missing where the law may require it (built)

For a posting with no pay, from a source that lists pay (Ashby, Lever,
Breezy), whose location names a state with a pay-range-in-postings law in
effect: "Pay missing: No pay is posted. Illinois requires a pay range in
job postings from employers with 15 or more employees: Illinois's rule."
Then: "Whether it covers this job depends on the employer's size and where
the work is done. Information, not legal advice."

- **The laws** live in one file, `src/lib/signals/pay-laws.ts`, each with
  its headcount threshold, effective date and a link to the state's own
  page (or its legislature's), all checked on the date in that file. As
  checked on Nov 22, 2026: California, Colorado, Connecticut (from Oct 1,
  2026), Washington D.C., Hawaii, Illinois, Maine (from July 29, 2026),
  Maryland, Massachusetts, Minnesota, New Jersey, New York, Vermont,
  Virginia (from July 1, 2026) and Washington. Delaware's takes effect
  Sept. 26, 2027 and is in the file, silent until then. Nevada and Rhode
  Island require pay only on request or after an interview, so a posting
  without pay doesn't break them; they're left out.
- **Reading the location:** a state counts when the location names it in
  full ("Seattle, Washington") or as a capital code after a comma
  ("Chicago, IL"), in any part of a location like "Chicago, IL; Remote
  (US)". "Washington, DC" is D.C., never Washington state; West Virginia is
  never Virginia. "Remote (US)" names no state, so it isn't flagged, even
  though some of these laws cover remote jobs: which law applies depends on
  facts the posting doesn't give.
- **Greenhouse** jobs are never flagged: its job list carries no pay, so a
  missing pay there means nothing.
- **City laws** (New York City, Jersey City, Cleveland and others) aren't
  checked: the state laws cover the places on my list.

### 3. Scam checks (last)

On text I paste or a kit's posting text: pay-to-start or equipment-check
requests, a "recruiter" on a free email domain, text-message-only contact,
and the developer-scam pattern (install a "meeting app", run a repo as a
take-home). Each flag quotes the sentence it found.

## Evals

A labelled set of postings (made up from real patterns: long-open,
reposted, fresh, slow-but-real) runs in CI with the unit tests, tracking
false alarms as well as misses for each signal. A rule change that adds a
false alarm on the set fails the build until the set or the rule is fixed.

## Options considered

- **A model judges each posting.** Rejected: costs money per job, can't
  show stable evidence, and its mistakes are hard to explain.
- **Hide flagged jobs.** Rejected: a warning I can weigh is more honest than
  a filter I can't see. A filter may come later, off by default.

## What would change our mind

- If the eval set shows the 60-day line flags real, hiring jobs often, the
  line moves, or age alone stops being enough.
- If a board's published date proves unreliable, that board's jobs use only
  Job Ranger's own first-seen date.
