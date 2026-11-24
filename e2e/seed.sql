-- Browser-test data for the local D1 (npm run e2e:seed). Safe to run again:
-- it starts from empty. Real-sized: long text, many jobs, every kind of card.
DELETE FROM draft_costs;
DELETE FROM resume_summaries;
DELETE FROM applications;
DELETE FROM answer_drafts;
DELETE FROM drafts;
DELETE FROM kits;
DELETE FROM model_usage;
DELETE FROM profile;
DELETE FROM answers;
DELETE FROM facts;
DELETE FROM board_interests;
DELETE FROM interests;
DELETE FROM board_counts;
DELETE FROM postings;
DELETE FROM boards;

-- Interests: one with keywords, one tagged on a company.
INSERT INTO interests (id, name, note, keywords) VALUES
	(1, 'Accessibility', 'Inclusive design and the people it serves', '["accessibility", "a11y"]'),
	(2, 'Civic tech', '', '[]');
INSERT INTO board_interests (source, board, interest_id) VALUES ('greenhouse', 'civic', 2);

INSERT INTO boards (source, token, company, last_fetched_at, last_fetch_ok, last_fetch_note) VALUES
	('ashby', 'example', 'Example Co', '2026-11-17T11:23:00.000Z', 1, '44 open, 3 new, 1 closed.'),
	('ashby', 'quiet', 'Quiet Co', '2026-11-17T11:23:00.000Z', 0, 'Board not found (404)'),
	('greenhouse', 'civic', 'Civic Co', '2026-11-17T11:23:00.000Z', 1, '1 open, 1 new, 0 closed.'),
	('lever', 'flight', 'Flight Co', '2026-11-17T11:23:00.000Z', 1, '1 open, 1 new, 0 closed.');

-- Daily open-job counts for Trending companies (design note 0007), 40 days back from today so
-- the trends hold whenever the tests run. Over 7 days: Example Co grows (63 → 70), Civic Co is
-- steady (13 → 12), Flight Co shrinks (23 → 20) with a two-day gap from failed fetches, and
-- Quiet Co's counts start 2 days ago: not enough data yet.
INSERT INTO board_counts (source, board, day, open_jobs)
	WITH RECURSIVE d(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM d WHERE n < 40)
	SELECT 'ashby', 'example', date('now', '-' || n || ' days'), 30 + (40 - n) FROM d
	UNION ALL SELECT 'greenhouse', 'civic', date('now', '-' || n || ' days'), 12 + n % 2 FROM d
	UNION ALL SELECT 'lever', 'flight', date('now', '-' || n || ' days'), 20 + n / 2 FROM d
		WHERE n NOT IN (3, 4)
	UNION ALL SELECT 'ashby', 'quiet', date('now', '-' || n || ' days'), 5 FROM d WHERE n < 3;

-- A Lever job: pay posted in Lever's salary range, applied for on Lever's form.
INSERT INTO postings (source, board, id, company, title, location, workplace, employment_type,
	department, apply_url, job_url, posted_at, pay_summary, pay_min, pay_max, pay_currency,
	pay_interval, first_seen_at, last_seen_at, seen_at) VALUES
	('lever', 'flight', '6e5c2b1a-0f3d-4f1e-9a51-1c2d3e4f5a6b', 'Flight Co',
		'Senior Firmware Engineer, Flight Controls', 'Remote - US; Austin, TX', 'remote', 'Full-time',
		'Engineering · Avionics',
		'https://jobs.lever.co/flight/6e5c2b1a-0f3d-4f1e-9a51-1c2d3e4f5a6b/apply',
		'https://jobs.lever.co/flight/6e5c2b1a-0f3d-4f1e-9a51-1c2d3e4f5a6b',
		'2026-11-11T16:00:00.000Z', '$150,000 – $190,000 per year', 150000, 190000, 'USD',
		'per-year-salary', '2026-11-11T11:23:00.000Z', '2026-11-17T11:23:00.000Z',
		'2026-11-12T00:00:00.000Z');

-- A Greenhouse job: its board lists no pay, so the card points to the posting.
INSERT INTO postings (source, board, id, company, title, location, workplace, department,
	apply_url, job_url, posted_at, first_seen_at, last_seen_at, seen_at) VALUES
	('greenhouse', 'civic', '4206440009', 'Civic Co', 'Software Engineer, Benefits Access',
		'Remote - US', 'remote', 'Engineering',
		'https://job-boards.greenhouse.io/civic/jobs/4206440009',
		'https://job-boards.greenhouse.io/civic/jobs/4206440009',
		'2026-11-12T15:00:00.000Z', '2026-11-12T11:23:00.000Z', '2026-11-17T11:23:00.000Z',
		'2026-11-13T00:00:00.000Z');

INSERT INTO postings (source, board, id, company, title, location, workplace, employment_type,
	department, apply_url, job_url, posted_at, pay_summary, pay_min, pay_max, pay_currency,
	pay_interval, first_seen_at, last_seen_at, closed_at, reopen_count, seen_at) VALUES
	('ashby', 'example', 'newest', 'Example Co', 'Senior Software Engineer, Accessibility',
		'Chicago, IL; Remote (US)', 'hybrid', 'Full time', 'Engineering · Platform',
		'https://jobs.ashbyhq.com/example/newest/application', 'https://jobs.ashbyhq.com/example/newest',
		'2026-11-16T15:00:00.000Z', '$150K - $180K', 150000, 180000, 'USD', '1 YEAR',
		'2026-11-16T11:23:00.000Z', '2026-11-17T11:23:00.000Z', NULL, 0, NULL),
	-- Reposted twice, so it carries a ghost-job warning (design note 0005).
	('ashby', 'example', 'long', 'Example Co',
		'Principal Staff Senior Lead Software Development Engineer in Test, Accessibility and Inclusive Design Systems, Platform Reliability and Developer Experience (Contract to Hire, Remote within the United States)',
		'Remote (US); Chicago, IL; New York, NY; San Francisco, CA; Austin, TX; Denver, CO; Seattle, WA',
		'remote', 'Contract', NULL,
		'https://jobs.ashbyhq.com/example/long/application', NULL,
		'2026-11-15T15:00:00.000Z', NULL, NULL, NULL, NULL, NULL,
		'2026-11-16T11:23:00.000Z', '2026-11-17T11:23:00.000Z', NULL, 2, NULL),
	('ashby', 'example', 'undated', 'Example Co', 'QA Engineer', 'Location not given', 'unknown', NULL,
		NULL, 'https://jobs.ashbyhq.com/example/undated/application', NULL, NULL, NULL, NULL, NULL,
		NULL, NULL, '2026-11-16T11:23:00.000Z', '2026-11-17T11:23:00.000Z', NULL, 0, NULL),
	('ashby', 'example', 'closed', 'Example Co', 'Closed Role', 'Remote', 'remote', NULL, NULL,
		'https://jobs.ashbyhq.com/example/closed/application', NULL, '2026-11-14T15:00:00.000Z', NULL,
		NULL, NULL, NULL, NULL, '2026-11-10T11:23:00.000Z', '2026-11-16T11:23:00.000Z',
		'2026-11-17T11:23:00.000Z', 0, NULL);

-- Forty more, already seen, posted over the past weeks.
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 40)
INSERT INTO postings (source, board, id, company, title, location, workplace, employment_type,
	department, apply_url, job_url, posted_at, pay_summary, first_seen_at, last_seen_at, seen_at)
SELECT 'ashby', 'example', 'job-' || i, 'Example Co', 'Software Engineer ' || i, 'Chicago, IL',
	'on-site', 'Full time', 'Engineering',
	'https://jobs.ashbyhq.com/example/job-' || i || '/application',
	'https://jobs.ashbyhq.com/example/job-' || i,
	strftime('%Y-%m-%dT%H:%M:%fZ', '2026-11-14T15:00:00Z', '-' || i || ' days'),
	CASE WHEN i % 3 = 0 THEN NULL ELSE '$120K - $140K' END,
	'2026-10-01T11:23:00.000Z', '2026-11-17T11:23:00.000Z', '2026-10-02T00:00:00.000Z'
FROM n;

-- Facts (made up): one confirmed, one pasted and waiting to be checked.
INSERT INTO facts (id, kind, experience, organization, period, text, source, confirmed_at) VALUES
	(1, 'accomplishment', 'professional', 'Example Co', '2019–2021',
		'Led the checkout rebuild that cut page load time in half.', 'typed',
		'2026-11-18T12:00:00.000Z'),
	(2, 'skill', 'side', 'Home lab', 'around 2015', 'Raspberry Pi and Home Assistant', 'pasted',
		NULL),
	(3, 'role', 'professional', 'Example Co', '2019–2021', 'Senior Developer', 'typed',
		'2026-11-18T12:00:00.000Z');

-- Answers (made up): a short one in my own words, and a longer one written together.
INSERT INTO answers (id, question, label, text, origin, notes) VALUES
	(1, 'work_authorization', '', 'Yes. I can work in the US without sponsorship.', 'own', ''),
	(2, 'about_me', '50 words', 'I started out hiring engineers.

Now I build accessible web apps and test them hard.', 'together', 'From voice notes.');

-- A prepared kit with a made-up letter draft, so the letter view is tested without an API key.
-- The second sentence's number isn't in its fact, so the checks flagged it.
INSERT INTO kits (source, board, posting_id, read_note, ai_rule, ai_decided_by, pasted) VALUES
	('ashby', 'example', 'newest', 'Ashby doesn''t share a form''s questions. Paste them in from the form.',
		'none', 'me', 'Tell us about a time you led a team.
What are your salary expectations?');
INSERT INTO drafts (source, board, posting_id, kind, paragraphs, problems, model, cost_micros,
	created_at) VALUES
	('ashby', 'example', 'newest', 'letter_full',
		'[[{"text":"I would like to join Example Co.","facts":[]}],[{"text":"I led the checkout rebuild that cut page load time in half.","facts":[1]},{"text":"It served 40 stores.","facts":[1]}]]',
		'[{"paragraph":1,"sentence":1,"problem":"The number 40 isn’t in the facts it cites."}]',
		'claude-sonnet-5-5', 7000, '2026-11-20T15:00:00.000Z');

-- A made-up drafted answer for that kit's leadership question, one sentence flagged.
INSERT INTO answer_drafts (source, board, posting_id, question, paragraphs, problems, model,
	cost_micros, created_at) VALUES
	('ashby', 'example', 'newest', 'Tell us about a time you led a team.',
		'[[{"text":"I led the checkout rebuild.","facts":[1]},{"text":"The team had 6 people.","facts":[1]}]]',
		'[{"paragraph":0,"sentence":1,"problem":"The number 6 isn’t in the facts it cites."}]',
		'claude-sonnet-5-5', 3000, '2026-11-20T16:00:00.000Z');

-- A kit whose made-up posting text has two scam patterns, for the scam check (design note 0005).
INSERT INTO kits (source, board, posting_id, read_note, ai_rule, ai_decided_by, pasted, posting_text)
	VALUES ('ashby', 'example', 'job-1', 'Pasted by hand.', 'none', 'me', '',
		'Great remote role. Your interview will be held over Telegram. We will mail you a check to buy your office setup from our vendor.');

-- A made-up resume summary draft for that kit, not yet on the resume. The second sentence's
-- number isn't in its fact, so the checks flagged it.
INSERT INTO resume_summaries (source, board, posting_id, paragraphs, problems, model, cost_micros,
	created_at) VALUES
	('ashby', 'example', 'newest',
		'[[{"text":"Senior Developer at Example Co.","facts":[3]},{"text":"Cut page load time in half for 40 stores.","facts":[1]}]]',
		'[{"paragraph":0,"sentence":1,"problem":"The number 40 isn’t in the facts it cites."}]',
		'claude-sonnet-5-5', 6000, '2026-11-21T15:00:00.000Z');

-- Made-up drafting costs for that kit ($0.01 so far), and four past applications whose drafting
-- cost $0.05 each, so the per-application average shows.
INSERT INTO draft_costs (source, board, posting_id, kind, model, price_table, cost_micros) VALUES
	('ashby', 'example', 'newest', 'letter_full', 'claude-sonnet-5-5', '2026-11-20', 7000),
	('ashby', 'example', 'newest', 'answer', 'claude-sonnet-5-5', '2026-11-20', 3000);
-- Application dates are relative to today, so the tracker's groups (design note 0006) hold
-- whenever the tests run: waiting, follow up now, no reply, and interviewing.
INSERT INTO applications (source, board, posting_id, company, title, applied_at, drafting_micros,
	status, status_at, status_note) VALUES
	('ashby', 'example', 'long', 'Example Co', 'A long posting',
		strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days'), 50000, 'applied', NULL, ''),
	('ashby', 'example', 'job-2', 'Example Co', 'Software Engineer 2',
		strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 days'), 50000, 'applied', NULL, ''),
	('ashby', 'example', 'job-3', 'Example Co', 'Software Engineer 3',
		strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-45 days'), 50000, 'applied', NULL, ''),
	('ashby', 'example', 'job-4', 'Example Co', 'Software Engineer 4',
		strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-20 days'), 50000, 'interviewing',
		strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days'), 'Call with Sam.');

