-- Lever board names are case-sensitive ("BluesInc" exists, "bluesinc" doesn't),
-- so a Lever name is stored as written. The other sources ignore case and stay
-- lowercase. Rebuilt the same way as 0002 and 0004; the columns are unchanged.

CREATE TABLE boards_new (
	source TEXT NOT NULL CHECK (source IN ('ashby', 'greenhouse', 'lever')),
	token TEXT NOT NULL CHECK (
		(token = lower(token) OR source = 'lever') AND length(token) BETWEEN 1 AND 100
	),
	company TEXT NOT NULL CHECK (length(company) BETWEEN 1 AND 200),
	added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	last_fetched_at TEXT,
	last_fetch_ok INTEGER CHECK (last_fetch_ok IN (0, 1)),
	last_fetch_note TEXT,
	paused INTEGER NOT NULL DEFAULT 0 CHECK (paused IN (0, 1)),
	PRIMARY KEY (source, token)
) STRICT;

INSERT INTO boards_new (source, token, company, added_at, last_fetched_at, last_fetch_ok,
	last_fetch_note, paused)
SELECT source, token, company, added_at, last_fetched_at, last_fetch_ok, last_fetch_note, paused
FROM boards;

CREATE TABLE postings_new (
	source TEXT NOT NULL,
	board TEXT NOT NULL,
	id TEXT NOT NULL,
	company TEXT NOT NULL,
	title TEXT NOT NULL,
	location TEXT NOT NULL,
	workplace TEXT NOT NULL CHECK (workplace IN ('remote', 'hybrid', 'on-site', 'unknown')),
	employment_type TEXT,
	department TEXT,
	apply_url TEXT NOT NULL CHECK (apply_url LIKE 'https://%'),
	job_url TEXT,
	posted_at TEXT,
	pay_summary TEXT,
	pay_min REAL,
	pay_max REAL,
	pay_currency TEXT,
	pay_interval TEXT,
	first_seen_at TEXT NOT NULL,
	last_seen_at TEXT NOT NULL,
	closed_at TEXT,
	reopen_count INTEGER NOT NULL DEFAULT 0,
	seen_at TEXT,
	PRIMARY KEY (source, board, id),
	FOREIGN KEY (source, board) REFERENCES boards_new (source, token) ON DELETE CASCADE
) STRICT;

INSERT INTO postings_new SELECT * FROM postings;

DROP TABLE postings;
DROP TABLE boards;
ALTER TABLE boards_new RENAME TO boards;
ALTER TABLE postings_new RENAME TO postings;

CREATE INDEX postings_open_newest ON postings (closed_at, posted_at DESC);
