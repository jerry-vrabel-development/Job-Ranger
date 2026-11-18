# 0003 — Interests and companies you can edit

- **Status:** Proposed
- **Date:** 2026-11-18
- **Author:** Jerry Vrabel

## Problem

Job Ranger watches a list of company job boards. Today the only way to change
that list is a database command in a terminal, and nothing in the app knows
_why_ a company is on it.

Interests change. Mine today: drones, robotics, IoT, e-bikes and electric
scooters, music, progressive politics, homelessness and housing, and
cannabis. Next year the list will be different. Changing it should take a minute in the
app, not a code change or a deploy.

## Goals

- Add, rename, pause and remove **interests** in the app.
- Add, pause and remove **companies** in the app, by pasting their job-board
  link.
- Tag each company with the interests it fits, and see jobs by interest.
- Keep the honest rules: every job still has its real apply link; nothing is
  guessed.

## Not goals (yet)

- **Finding new companies automatically.** There is no public list of every
  Ashby or Greenhouse board, and scraping one is out (0002). Suggesting
  companies for an interest comes later, as an assistant tool through the MCP
  server, with you approving each one.
- **Scoring.** Interests are data the later scoring step (0001 steps 5 and 6)
  can use. This note doesn't rank jobs by them. "Working with smart people on
  ingenious products" belongs there too: it's a quality of the team that
  scoring looks for in every company, not a field to file companies under.

## What scoring will look for (recorded here, designed later)

Two things that are about the company, not the field. They belong to the
scoring step and to 0002's company insight, with the same rules: every
signal has a source and a date, "unknown" is an allowed answer, and no
scraping.

- **Smart people, ingenious products.** Signals: what the company has
  shipped, the engineering team's own writing and open-source work.
- **How a company treats and values its people.** Signals from the
  company's own postings and pages: pay posted, and how wide the range is;
  benefits named in the posting (parental leave, health cover, time off);
  remote-friendly roles. Signals from public records, each to be checked
  for coverage before we rely on it: layoff notices (WARN, already in
  0002), federal wage-and-hour and workplace-safety enforcement records,
  union elections, and certifications such as B Corp. Review sites stay out
  without a public API, so this is not a "what employees say" score, and the
  card will say so.

The result is shown as the signals and their sources, with a short summary,
not a single number that hides how it was reached.

## Design

### Interests

An interest is a short name ("Robotics"), an optional note in your words
("hardware that moves; warehouse and field robots"), and a few **keywords**
("robot", "robotics", "autonomy", "ROS").

- **Tags on companies** are the main link: a drone company is tagged Drones,
  so all of its jobs show under Drones.
- **Keywords catch the rest:** a job whose title or department contains a
  keyword shows under that interest even at a company not tagged with it (a
  robotics role at a music company). Matching is whole-word and ignores case,
  so "ROS" doesn't match "across". Each job shows _why_ it matched, as text:
  "Robotics: company tag" or "Robotics: title has 'robotics'".
- **Pause, don't lose:** a paused interest drops out of filters but keeps its
  tags, so turning it back on restores everything.
- **Remove** deletes the interest and its tags, after a confirm that names how
  many companies are tagged with it. Companies and jobs stay.

### Companies

- **Add by pasting a link.** Paste any job-board link
  (`jobs.ashbyhq.com/suno`, `job-boards.greenhouse.io/splice`, or a single
  job's link). Job Ranger works out the source and board name, then
  **checks before saving**: it fetches the board once and shows "Splice:
  12 open jobs found" or a plain error ("No Greenhouse board called 'splise'
  — check the spelling"). You then name it, tag it and save.
- **Only known hosts.** The link is read for its source and board name; the
  fetch goes to the source's own API address, built from that name. Any other
  host is refused, so a pasted link can never make the Worker call an address
  it chooses.
- **Pause** stops the daily fetch and hides its jobs; the history stays.
  This is the normal way to drop a company.
- **Remove** deletes the company and its jobs (the existing cascade), after a
  confirm that names the number of jobs that go with it.
- **Companies page:** each company with its source, tags, open jobs, last
  fetch and its result in words ("12 open, 2 new", "Board not found").

### Data (migration 0003)

- `interests`: id, name (unique), note, keywords (JSON list), paused,
  created and updated times.
- `board_interests`: board and interest, both foreign keys with
  `ON DELETE CASCADE`.
- `boards` gains `paused`. No table rebuild: adding a column is a plain
  `ALTER TABLE`.
- Keyword matches are worked out when the page loads, not stored, so editing
  keywords takes effect at once. At a few thousand open jobs that is cheap; if
  it stops being cheap, store matches at fetch time.

### Pages and forms

- **Interests** and **Companies** pages, linked from the jobs page.
- **Jobs page:** a filter by interest (a set of labeled buttons with a count
  each, the selected one marked with a check and text, not color alone), plus
  the existing list.
- Forms are SvelteKit form actions: they work without JavaScript, and
  SvelteKit's same-origin check guards them. Every input is validated on the
  server; errors appear next to the field, in words, and are announced to
  screen readers.
- Everything stays behind the existing Access check. No new secrets.

## Options

**A. Interests as data, tags plus keywords (recommended).** Small, testable,
and it explains every match.

**B. A free-text profile for the model only.** Simple to edit, but nothing
works until scoring exists, and the match can't be explained without the
model.

**C. A fixed list in code.** What we'd be avoiding: every change is a PR and a
deploy.

**Choice: A.** B can come later on top of it: the interests and notes become
part of what the scoring model reads.

## Build order

1. **Companies page:** add by link with the check, pause, remove, and "Check
   now". (This replaces the terminal commands.) _Built._
2. **Interests:** create, edit, pause, remove; tag companies.
3. **Jobs by interest:** the filter, keyword matches, and the "why it
   matched" line.
4. **Later:** company suggestions through the MCP server; interests feed
   scoring.

Each step is one PR with unit, database and browser tests, including axe.

## Decisions (Nov 18, 2026)

1. **Tags and keywords, both,** in step 3.
2. **"Smart people, ingenious products" is not an interest.** It's about the
   team, not the field, so the scoring step looks for it in every company.
3. **How a company treats and values its people** is scored too, from the
   signals above.
4. **Remove ships in step 1,** next to pause. Pause is for "not now";
   remove is for "not ever".

## What would change our mind

- If keyword matches turn out noisy, drop them and keep tags only.
- If adding companies one link at a time is too slow, add a paste-a-list
  import that runs the same check for each.
