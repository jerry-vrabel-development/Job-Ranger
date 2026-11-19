-- Each company's open-job count, once a day, so the company page can show
-- hiring momentum. History can't be filled in later, so it starts now.
--
-- No foreign key to boards, on purpose: adding a source rebuilds the boards
-- table (0002, 0004-0006), and in SQLite dropping a table that others point
-- to deletes their rows. Removing a company deletes its counts explicitly
-- instead (db.ts removeBoard).

CREATE TABLE board_counts (
	source TEXT NOT NULL,
	board TEXT NOT NULL,
	day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	open_jobs INTEGER NOT NULL CHECK (open_jobs >= 0),
	PRIMARY KEY (source, board, day)
) STRICT;
