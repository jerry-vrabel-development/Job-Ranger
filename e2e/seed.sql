-- Browser-test data for the local D1 (npm run e2e:seed). Safe to run again:
-- it starts from empty. Real-sized: long text, many jobs, every kind of card.
DELETE FROM postings;
DELETE FROM boards;

INSERT INTO boards (source, token, company, last_fetched_at, last_fetch_ok, last_fetch_note) VALUES
	('ashby', 'example', 'Example Co', '2026-11-17T11:23:00.000Z', 1, '44 open, 3 new, 1 closed.'),
	('ashby', 'quiet', 'Quiet Co', '2026-11-17T11:23:00.000Z', 0, 'Board not found (404)'),
	('greenhouse', 'civic', 'Civic Co', '2026-11-17T11:23:00.000Z', 1, '1 open, 1 new, 0 closed.');

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
	('ashby', 'example', 'long', 'Example Co',
		'Principal Staff Senior Lead Software Development Engineer in Test, Accessibility and Inclusive Design Systems, Platform Reliability and Developer Experience (Contract to Hire, Remote within the United States)',
		'Remote (US); Chicago, IL; New York, NY; San Francisco, CA; Austin, TX; Denver, CO; Seattle, WA',
		'remote', 'Contract', NULL,
		'https://jobs.ashbyhq.com/example/long/application', NULL,
		'2026-11-15T15:00:00.000Z', NULL, NULL, NULL, NULL, NULL,
		'2026-11-16T11:23:00.000Z', '2026-11-17T11:23:00.000Z', NULL, 0, NULL),
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
