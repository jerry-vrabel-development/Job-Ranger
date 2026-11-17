-- Job boards to read, and the postings found on them.
-- Dates are ISO 8601 text in UTC. The company list lives here, not in the
-- repository, so whose boards I'm watching stays private.

CREATE TABLE boards (
	source TEXT NOT NULL CHECK (source IN ('ashby')),
	token TEXT NOT NULL CHECK (token = lower(token) AND length(token) BETWEEN 1 AND 100),
	company TEXT NOT NULL CHECK (length(company) BETWEEN 1 AND 200),
	added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	-- The last daily fetch of this board: when, and how it went.
	last_fetched_at TEXT,
	last_fetch_ok INTEGER CHECK (last_fetch_ok IN (0, 1)),
	last_fetch_note TEXT,
	PRIMARY KEY (source, token)
) STRICT;

CREATE TABLE postings (
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
	FOREIGN KEY (source, board) REFERENCES boards (source, token) ON DELETE CASCADE
) STRICT;

-- The list page: open postings, newest first.
CREATE INDEX postings_open_newest ON postings (closed_at, posted_at DESC);
