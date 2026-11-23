# 0006 — Tracking: saved, passed, and what happens after I apply

- **Status:** Accepted. Part 1 (saved and passed) built; part 2 next
- **Builds on:** [0001](0001-job-ranger.md), roadmap step 3

## Problem

The job list has no memory of what I decided. A job I've already ruled out
shows up every day, a job I meant to come back to is lost among the rest,
and once I apply, nothing tells me when to follow up or when to stop
waiting. 0001 promises a tracker that knows about ghosting.

## Goals

- **Calm, not a pipeline to manage.** One mark per job, plain words, no
  counts to chase.
- **Decisions stick.** A job I pass on stays off the list until I ask for
  it, and every mark can be undone.
- **Time-based rules in code, tested with a fake clock:** the "No reply"
  timer and follow-up reminders.

## Part 1: saved and passed (built)

- **Save** a job to come back to; **Pass** on one, with an optional note
  ("Needs a clearance") that's only for me. One mark per job: a new one
  replaces the old.
- **Passed jobs leave the list.** The summary says how many are hidden, and
  a **Show** filter offers "All but passed" (the default), "Saved only" and
  "Passed only". On a passed job, "Put back on the list" undoes it; on a
  saved one, "Unsave".
- Marks live in `job_marks` (migration 0017). A company's marks go with it,
  like its kits; applications stay as history.
- Every button names its job for screen readers, the status line says what
  happened in words, and the list works without JavaScript.

## Part 2: after I apply (next)

- **Statuses:** applied → interviewing → offer, or rejected or withdrawn,
  each with its date and an optional note, on the kit and on a Tracker page.
- **No reply:** an application still at "applied" after 30 days shows "No
  reply", worked out from the dates when the page loads, so there's no
  timer to run and nothing to go stale.
- **Follow-up reminders:** at 7 and 14 days with no reply, the Tracker shows
  "A good time to follow up", calm and dismissable.
- The intervals are named constants, tested with a fake clock, and said on
  the page.

## Options considered

- **Hide passed jobs for good.** Rejected: mistakes happen, and "Passed
  only" with an undo costs little.
- **A "No reply" status written by a scheduled job.** Rejected: working it
  out from dates on each load can't drift and needs no cron.
