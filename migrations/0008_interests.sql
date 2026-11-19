-- Interests (design note 0003): a name, a note in your own words, and
-- keywords; companies are tagged with them.
--
-- board_interests has no foreign key to boards, for the same reason as
-- board_counts (0007): adding a source rebuilds boards, and dropping a table
-- that others point to deletes their rows. Removing a company deletes its
-- tags explicitly (db.ts removeBoard). Removing an interest deletes its tags
-- by the foreign key below.

CREATE TABLE interests (
	id INTEGER PRIMARY KEY,
	name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(name) BETWEEN 1 AND 60),
	note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 300),
	keywords TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(keywords) AND json_type(keywords) = 'array'),
	paused INTEGER NOT NULL DEFAULT 0 CHECK (paused IN (0, 1)),
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE board_interests (
	source TEXT NOT NULL,
	board TEXT NOT NULL,
	interest_id INTEGER NOT NULL REFERENCES interests (id) ON DELETE CASCADE,
	PRIMARY KEY (source, board, interest_id)
) STRICT;
