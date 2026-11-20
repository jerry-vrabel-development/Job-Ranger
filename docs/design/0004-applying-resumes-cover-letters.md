# 0004 — Applying: answers, resumes and cover letters

- **Status:** Proposed
- **Date:** 2026-11-19
- **Author:** Jerry Vrabel

## Problem

Job Ranger finds jobs and says why they match, but applying still happens by
hand, from scratch, every time: the same facts retyped into every form, a
resume that isn't fitted to the role, a cover letter started from a blank
page. On a heavy day that is where applying stops.

I want applying to be fast and honest: answers ready, a resume and cover
letter fitted to the role, and nothing sent that isn't true or that I haven't
read.

## Goals

- **Fast:** from a job card to a submitted application in about ten minutes,
  most of it reading and pasting. (A target to measure, not a promise.)
- **Honest:** every claim on a resume, letter or answer traces to a fact I
  have confirmed. Hobby experience is never described as professional.
- **Plain and specific:** drafts read like a person, not like generic
  assistant prose; my edits make them mine.
- **Kind on hard days:** never a blank page; the slow work is done once.
- **Respect employers' rules:** a posting that forbids AI-written answers
  gets my own words.

## Not goals

- **Applying for me.** Job Ranger never fills in or submits an application.
  I open the real form and submit it myself.
- **AI-detector tools.** Job Ranger doesn't score or adjust text for AI
  detectors.
- **Storing voluntary EEO or veteran answers.** Those stay mine to answer on
  each form.
- **Tracking statuses after applying.** That is roadmap step 4; this note
  only records what was sent.

## Design

### 1. Fact bank

Everything true about my work, as data: roles, accomplishments, projects,
skills and tools, education, links. Far more than any one resume shows. I
have 20+ years of experience, much of it left off for brevity, so the bank
grows over time.

Each fact holds: the text, the organization or project, when (from–to, or
"around 2009"), its **kind of experience** (professional, side project or
hobby, learning now), where it came from (my resume, a gap question, typed
in), and whether I have **confirmed** it.

- **Seeded from my current resume and cover letter.** Both were drafted with
  AI, so every seeded fact starts unconfirmed; I confirm each one once
  ("yes, that's mine") or fix or drop it. Only confirmed facts are used.
- **Kept current:** a fact is edited once and every later resume uses it
  (for example, Job Ranger's test count).
- Retired facts are kept (applications record which facts they used) but
  are no longer offered.

### 2. Answer bank

Ready answers to the questions most forms ask: work authorization, start
date, remote or relocation, how I heard of the role, pay expectations, and
short versions of my story (about 50, 150 and 300 words). Each answer is
tagged by question type ("why this company", "a time you handled conflict")
and by **how it was written**: my own words, written together (see 5), or an
AI draft I edited. That label decides where an answer may be reused.

### 3. Apply kit

One click from a job card. It shows:

- **The job's own questions**, where the job board gives them. Greenhouse's
  job board API can return a posting's questions; Ashby and Lever are to be
  checked. Otherwise I add the questions by pasting them.
- **Answers**, filled in from the answer bank by question type, plus drafts
  for the job-specific ones (where AI is allowed), each with a copy button.
- **A tailored resume:** confirmed facts picked and ordered for this role,
  with the summary fitted to it. Code chooses and orders the facts; the
  model only writes the summary (where AI is allowed). Single column, plain
  structure, so applicant tracking systems read it.
- **A cover letter draft:** full page by default (my current letter is about
  430 words), with a short version (about 150 words) for small boxes.
- **Gap questions, not verdicts.** "The role asks for Kubernetes; it's not in
  your bank yet. Have you used it?" One-tap answers: professional (where,
  roughly when, one line), side project or hobby, learning it now, or no. A
  yes becomes a new fact, labeled honestly, and is used at that level.
- **The AI rule,** if the posting has one: its exact sentence, quoted. When
  the check isn't sure, it asks me rather than guessing.
- **"Open application"** to the real form, then **"I applied"**, which
  records what I sent: resume and letter versions, each answer, and which
  facts they used.

### 4. Drafting with the model

The Worker calls the Claude API (option A). Drafts are built only from
confirmed facts and my answer bank, plain and specific, and the model must say which
facts each sentence uses. Code then checks it (see 7).

- **Models:** a mid-sized model (Sonnet) writes drafts; a small, fast one
  (Haiku) runs quick checks like the AI-rule check and generic-line review;
  the largest (Opus) only judges evals, on demand, never per kit. Prices are
  checked when step 4 is built, not assumed here.
- **The model never sees** my phone, email or address (code puts those on
  the resume), or anything I haven't confirmed.
- **API key:** a Worker secret, set with `wrangler secret put`, never in the
  repository or a chat.
- **Cost:** a few cents per kit. A hard daily cap in the app (starting
  around $1, changeable) stops runaway spending; when it's reached the kit
  says so and still works without a model. A spending limit in Anthropic's
  Console is the second guard.

### 5. Postings that forbid AI: write together

When a posting forbids AI-written answers, its questions go on a **write
together** list instead of getting drafts.

- When I'm up for it, Claude asks me questions about each one; I answer by
  talking or typing, in fragments if that's what I have; Claude says what's
  strong, missing or too long, and I shape it. Claude doesn't write the
  sentences.
- The finished answer goes into the answer bank, tagged by question type and
  marked "my own words", so the next posting asking something similar is
  already answered. Over time most of these questions are covered.
- **Receipts:** each such answer keeps how it was made (my fragments or
  dictation, my edits, dates), in case one is ever questioned.
- On a hard day these postings can wait on a **good day pile**, shown as a
  count, not a timer, while the fast kit handles the rest.
- Pasting my own saved words into an ordinary application form is fine.
  Some timed assessment platforms record pasting; for those, type it in.

### 6. Final review

A **Review** button beside every writing field (answers, letter, resume
summary). It suggests; nothing changes unless I accept. Each suggestion says
what it is in words ("Wrong company", "Not in your facts", "Too long"),
never by color alone.

- **By code:** wrong company or role name (the copy-paste slip), length over
  the field's limit, claims and numbers not in my facts, text identical to
  what another company got (with the line to tailor).
- **By the model:** generic lines (with a prompt for the specific thing only
  I could say), clarity, repetition.
- **On no-AI postings,** feedback only: it names the problem; I fix it in my
  own words.

### 7. Evals

Scoring and drafting are the portfolio centerpiece, so they are measured.

- **In CI, by code (no model, no cost):** every sentence cites at least one
  fact; every cited fact exists and is confirmed; every number in a draft
  appears in a cited fact; company and role names match the posting; lengths
  are within limits; hobby facts are never worded as professional (word
  list); the model's output is checked with recorded responses.
- **By script, against the real model (costs money, run on demand):** a set
  of about 30 real postings from my boards, with expected AI-rule results and
  a checklist per draft; a second model pass judges whether each sentence is
  supported by its cited facts. Results are saved, so changes to prompts are
  compared, not guessed.

### Data (migrations 0009 onward)

- `facts`: id, kind, text, organization, when (`period`, in words, may be
  approximate), experience (`professional`, `side`, `learning`), source,
  confirmed_at, retired_at, created and updated times.
- `answers`: id, question type, label (to tell versions apart), text,
  origin (`own`, `together`, `ai_edited`), notes (the receipts), created
  and updated times.
- `kits`: one per job I open a kit for: the form's questions, pasted
  questions, the AI rule (and its sentence, and whether the check or I
  decided), created time. Drafts come with step 4.
- `applications`: posting, applied time, the versions sent, and the fact ids
  each used. Tracking (step 4) builds on this table.
- Generated resumes and letters are stored privately in R2 only if I keep
  them; the record of what was sent is in D1.
- New tables keyed by board follow 0003's rule: no foreign key to `boards`.

### Pages

- **Facts** and **Answers** pages (forms work without JavaScript, errors next
  to the field, axe-checked like the others).
- **Apply kit** page per job, linked from each job card.
- Everything stays behind Cloudflare Access. Logs carry counts only, never
  fact or answer text.

## Options considered

**A. Drafts in the app, via the Claude API (chosen).** Fastest for me, and it
is the shipped model feature with evals the portfolio needs. Costs a few cents
per kit.

**B. Drafts in Claude chat, through an MCP server.** No API cost, but slower:
switching between the app and a chat. Can come later, when the MCP server
exists.

**C. Templates only.** Free and predictable, but not really tailored.

## Build order

Each step is one PR with unit, database and browser tests, including axe.

1. **Fact bank:** page, seeded from my resume and letter as unconfirmed
   facts; confirm, edit, retire, add. _Built._ As built, "when" is one field
   in words (`period`), not separate start and end.
2. **Answer bank:** page, question types, origin labels. _Built._ As built:
   13 common question types plus "Other" (including "How you use AI
   tools"), an optional name to tell versions apart ("150 words"), a word
   count, a Copy button, and a list of common questions not yet answered.
3. **Apply kit without a model:** the job's questions (Greenhouse first),
   saved answers by type, a resume picked by code from confirmed facts, gap
   questions that add facts, the AI-rule check (code), "Open application" and
   "I applied". _Built in two parts._ **3a (built):** a kit page per job,
   linked from each job card. Greenhouse forms are read when I prepare the
   kit (one GET, never in the daily fetch); other boards' questions are
   pasted in. Questions are matched to answer types by readable rules, an
   unmatched question can browse any type, the AI-rule check quotes the
   sentence it found and my say overrides it (and survives a re-read), and
   "I applied" records the date and the answers offered (applications keep
   company and title, and stay if the company is removed). **3b (built):**
   a printable resume per job, picked by code from confirmed facts: every
   professional role newest first with its four best-fitting
   accomplishments, the three best-fitting projects, every skill (side and
   learning ones labeled), education and links, and "picked for" words. A
   fact ranks by the job's words it shares (title 3, team 2, posting 1;
   filler and generic title words skipped). Skills the posting names that
   no fact mentions are gap questions (from a list of about 150 skills);
   an answer adds a confirmed fact at the level I gave, and "No" stops the
   question for that job. Name and contact details live in "Your details"
   on Facts and are never sent to a model. The posting's text is read from
   Greenhouse or pasted in, and the AI-rule check reads it too.
4. **Model drafts:** summary, cover letter, job-specific answers, with fact
   citations and the code checks; the daily cost cap.
5. **Final review** (code checks first, then model suggestions).
6. **Evals script** and the saved set of postings.
7. **Write together** list and the good day pile.

Step 1 and 2 are useful on their own: copy-paste answers right away.

## Decisions (Nov 19, 2026)

1. **Option A:** the app drafts with the Claude API.
2. **Never apply for me.** No-AI postings go to the write together list,
   and those answers are saved for reuse.
3. **A gap is a question, not a verdict.** Missing from the bank means "not
   added yet", and my answer is recorded at the level I give it.
4. **Full-page cover letter by default,** with a short version on hand.
5. **Final review** on every writing field, suggestions only.
6. **No voice profile** for now: drafts start from my confirmed facts and
   are made mine by my edits.
7. **Models:** Sonnet for drafts, Haiku for quick checks, Opus only for
   eval judging; a hard daily cap, starting around $1.
8. **After "I applied",** follow-up is tracked in Job Ranger (step 4), not
   in Quest Log.

## Open questions

- **Resume file:** built as a print-ready page saved as PDF from the
  browser. Revisit a PDF built in the Worker if uploads need it.
- **Ashby and Lever:** do their public APIs give a posting's questions?

## What would change our mind

- If kits take much longer than about ten minutes in practice, the slow step
  gets its own fix before anything new.
- If the code checks miss a made-up claim even once, drafting stops until
  the check is fixed.
- If API costs climb past the cap regularly, move drafting to option B.
