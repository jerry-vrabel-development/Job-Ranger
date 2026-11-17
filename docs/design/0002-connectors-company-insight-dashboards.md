# 0002 — Connectors, company insight and dashboards

- **Status:** Proposed
- **Date:** 2026-11-17
- **Author:** Jerry Vrabel

## Problem

0001 decides what Job Ranger does. This note decides how it fits into the way
a person already works, so the job search is simple: the AI assistant they
use, the documents they keep, and the email that carries the news. It also
covers two things a job seeker needs to see: what a company is really like
right now, and how their own search is going.

Where things live today, for the first user (me): Gmail and a local drive.
Other people will use Outlook, Google Drive, OneDrive, Dropbox, other AIs. The
design has to work for me now and for them later.

## Principles

- **Job Ranger is the hub.** It holds the jobs, the applications and the
  facts. Everything else connects to it.
- **Each connector sits behind one small interface:** an email source, a
  document store, an AI client, a model provider. The first version of each
  is the simplest one that works for me; others plug in later without
  touching the rest.
- **It automates the busywork; you make the decisions.** Nothing is sent,
  applied for or deleted without you. Drafts are drafts.
- **Least data.** A connector sees only what it needs, and stores only what
  the features use.

## Connectors

### AI: any assistant, through MCP

- **Job Ranger's MCP server** is the way in for any assistant that speaks
  MCP (Claude, ChatGPT and others). Tools to start: today's ranked jobs,
  save / pass / mark applied, what needs a follow-up, a company brief, the
  application timeline. Signed in with OAuth, like Quest Log's server.
- **The scoring model is swappable** behind a provider interface. The evals
  (0001) decide whether a different model or prompt is better, so a switch is
  a measured decision, not a guess.

### Email: review, update, automate

|            | Option A: forwarding (v1)                                                                       | Option B: mailbox APIs (later)                                                     |
| ---------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| How        | A mail filter forwards job emails to a Job Ranger address; a Cloudflare Email Worker reads them | Job Ranger reads the inbox through Gmail or Outlook APIs                           |
| Works with | Any email provider                                                                              | One integration per provider                                                       |
| Sees       | Only what you forward                                                                           | Whatever the permission allows                                                     |
| Setup      | One filter                                                                                      | OAuth; Google requires a security review for inbox-reading apps used by the public |

**Choice: A for v1.** It works for everyone, sees only what you choose, and
needs no inbox permission. B can be added later for people who want it.

- **Review:** each application shows its emails, newest first.
- **Update:** a confirmation moves a job to Applied, a rejection to Closed,
  an invite to Interviewing. A model sorts each email, with its own eval;
  a low-confidence sort asks you instead of guessing.
- **Automate:** follow-up drafts appear in Job Ranger with "Copy" and "Open in
  email". You send them. (Writing into a mailbox's drafts folder needs mailbox
  permission, so it comes with Option B.)

### Quiet rejections

Rejections are information the tracker needs, not news anyone needs to watch
arrive. They are handled out of view and out of the headspace.

- **Filed quietly.** An email sorted as a rejection moves its application to
  **Closed** (the word is "Closed", not "Rejected"), with no notification or
  badge, and out of the main view. The email is kept under a "Closed" filter,
  opened only when you choose.
- **The brief:** says nothing, or one gentle line ("2 applications closed
  this week"), as you set it.
- **The numbers still count it.** Response rate and ghosting rate need it. A
  closed application counts as a reply, not a failure.
- **Out of Gmail too:** a filter sends job-board mail past the inbox and
  forwards it, so Job Ranger becomes the job-mail inbox: interviews and replies
  up front, rejections filed. With mailbox APIs (Option B) Job Ranger could
  label and archive rejections in Gmail itself.
- **Two layers, because rejections are formulaic.** Rules in code catch the
  common phrasings first ("decided to move forward with other candidates",
  "the position has been filled"): cheap, instant, unit-tested. The model
  sorts what the rules aren't sure of.
- **Good news is never hidden.** Anything neither layer is confident is a
  rejection stays visible. The eval set is weighted toward look-alikes: the
  "we received your application" acknowledgement (Applied, not Closed), "not
  this role, but would you consider…" (good news, kept up front), and "we'll
  keep your resume on file" (closed, kindly). The bar for good news filed as a
  rejection is zero on the test set.

### Documents: which version went where

- **v1: upload.** Resume and cover-letter versions are uploaded to Job Ranger
  (stored privately in R2) and linked to each application, so you always
  know which version you sent. From a local drive that's a file picker, or an
  AI assistant with access to your files can attach them through the MCP
  server.
- **Later: document stores.** Google Drive, OneDrive and Dropbox behind the
  same interface, linking to the file instead of copying it.
- **Editing stays yours.** You edit documents with your own tools and AI.
  Job Ranger tracks versions; it doesn't write application answers.

## The daily workflow

1. **Morning brief:** new jobs ranked, anything flagged, follow-ups due.
   On the dashboard, by email, or from an AI assistant.
2. **Decide:** save, pass or apply, one click each, with the apply link.
3. **Email keeps the tracker current** without typing.
4. **Follow-ups:** a reminder and a draft when it's time. Optionally a Quest
   Log quest with a tiny first step.
5. **See how it's going** on the dashboards.

## Company insight: summary, health and outlook

Every fact has a source and a date. "Unknown" is an allowed answer.

- **Job Ranger's own data:** hiring momentum (open roles over time, from the
  company's job board), roles reposted again and again, and how fast the
  company replied to you.
- **SEC EDGAR** (free, official): public companies' filings for revenue
  trends and material events; Form D filings for private fundraising.
- **WARN notices:** layoff notices that states publish.
- **The company's own pages:** mission and values.
- **The outlook** is a short summary written by the model from those sourced
  facts only, with a faithfulness eval: every sentence must trace to a
  source. It summarises signals; it is not a prediction.
- **Not used:** review sites without a public API. No scraping.

## Dashboards and metrics

Visual and polished, and honest and accessible at the same time.

- **Your search:** the funnel (found → saved → applied → replied →
  interview → offer), response rate and time-to-reply by company and source,
  ghosting rate, which sources lead to interviews.
- **Companies:** hiring momentum, reply speed, flags.
- **Honest signals:** flags raised, and how many turned out right.
- **The model:** eval scores by prompt version, cost per run.
- **Motion with meaning:** charts animate in, numbers count up, the funnel
  fills, using Svelte's built-in motion. All of it stops when reduced motion
  is on.
- **Accessible:** every chart has a plain table and a one-line summary, never
  relies on color alone, and is reachable by keyboard. One consistent,
  tested color palette in light and dark.
- **No pressure:** no streaks, no "apply more" nudges. Just your numbers.

## Scaling to other people

- **v1 is single-user**, behind Cloudflare Access (as the Allegedly & Sons
  Ledger is).
- **Accounts later:** sign-in (passkeys or OAuth), every row scoped to a
  user, tests that prove one user can never see another's data, and
  per-user export and delete.
- The connector interfaces above are what make other email providers,
  document stores and AIs a matter of adding an adapter.

## Options

**A. Hub with adapters (recommended).** Job Ranger owns the data; each
connector is a small adapter behind an interface; v1 ships the simplest
adapter of each kind (forwarding, upload, MCP).

**B. Build directly on Gmail and Google Drive.** Faster for me today, but it
ties the app to one provider, needs inbox and drive permissions from day
one, and makes everyone else a rewrite.

**Choice: A.**

## Where this fits in 0001's build order

- After tracking (0001 step 3): email forwarding and status updates, then
  document uploads.
- With scoring and evals (steps 5 and 6): the model provider interface.
- After evals: dashboards, then company insight.
- The MCP server (step 8) gains the tools above.

## What would change our mind

- If forwarding proves too fiddly to set up, offer Option B for Gmail first,
  for personal use.
- If the free company data is too thin to be useful, show only Job Ranger's
  own signals rather than pad the summary.
