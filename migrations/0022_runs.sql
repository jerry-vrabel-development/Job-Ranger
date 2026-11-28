-- One row per daily run (design note 0011), so the app can say when a run was
-- missed, didn't finish, or hit a problem. The run writes the row when it
-- starts, adds the fetch counts after the fetch, and fills in the rest when it
-- finishes; a row with no finished_at is a run that never finished.
--
-- Counts and our own words only: no company names, no provider responses.
-- The run deletes rows older than 90 days.

CREATE TABLE runs (
	id INTEGER PRIMARY KEY,
	scheduled_at TEXT NOT NULL,
	started_at TEXT NOT NULL,
	finished_at TEXT,
	-- The fetch's counts; null until the fetch has finished.
	boards INTEGER CHECK (boards >= 0),
	boards_ok INTEGER CHECK (boards_ok >= 0),
	boards_failed INTEGER CHECK (boards_failed >= 0),
	added INTEGER CHECK (added >= 0),
	closed INTEGER CHECK (closed >= 0),
	deferred INTEGER CHECK (deferred >= 0),
	-- off: not set up. ran: it ran (see stopped). failed: it threw part way.
	-- Null until scoring was reached.
	scoring TEXT CHECK (scoring IN ('off', 'ran', 'failed')),
	scored INTEGER CHECK (scored >= 0),
	unscored INTEGER CHECK (unscored >= 0),
	waiting INTEGER CHECK (waiting >= 0),
	spent_micros INTEGER CHECK (spent_micros >= 0),
	stopped TEXT CHECK (stopped IN ('cap', 'time', 'error')),
	-- A short sentence in our own words, or null.
	problem TEXT CHECK (length(problem) <= 500)
) STRICT;

CREATE INDEX runs_started ON runs (started_at);
