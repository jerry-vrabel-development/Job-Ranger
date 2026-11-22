-- Resume summary drafts (design note 0004, step 4c).
--
-- resume_summaries: the latest drafted summary per job, with the facts each
-- sentence cites and the code checks' findings, like drafts (0013). The
-- resume uses a summary only once I've chosen it: kept_text is what I chose
-- (the draft as it was, or my edit of it), kept_edited says which. A new
-- draft clears the choice. No foreign key to boards (see 0007); a company's
-- rows go with it.
--
-- draft_costs (0015) is rebuilt so its kind may be 'summary'. SQLite can't
-- change a CHECK in place; every row is copied, ids included.

CREATE TABLE resume_summaries (
	source TEXT NOT NULL,
	board TEXT NOT NULL,
	posting_id TEXT NOT NULL,
	paragraphs TEXT NOT NULL CHECK (json_valid(paragraphs) AND json_type(paragraphs) = 'array'),
	problems TEXT NOT NULL DEFAULT '[]'
		CHECK (json_valid(problems) AND json_type(problems) = 'array'),
	model TEXT NOT NULL,
	cost_micros INTEGER NOT NULL CHECK (cost_micros >= 0),
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	kept_text TEXT CHECK (kept_text IS NULL OR length(kept_text) BETWEEN 1 AND 1500),
	kept_edited INTEGER NOT NULL DEFAULT 0 CHECK (kept_edited IN (0, 1)),
	kept_at TEXT,
	CHECK ((kept_text IS NULL) = (kept_at IS NULL)),
	PRIMARY KEY (source, board, posting_id)
) STRICT;

CREATE TABLE draft_costs_new (
	id INTEGER PRIMARY KEY,
	source TEXT NOT NULL,
	board TEXT NOT NULL,
	posting_id TEXT NOT NULL,
	kind TEXT NOT NULL CHECK (kind IN ('letter_full', 'letter_short', 'answer', 'summary')),
	-- The model id the API reported, and the price table version used.
	model TEXT NOT NULL,
	price_table TEXT NOT NULL,
	cost_micros INTEGER NOT NULL CHECK (cost_micros >= 0),
	at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

INSERT INTO draft_costs_new (id, source, board, posting_id, kind, model, price_table, cost_micros, at)
	SELECT id, source, board, posting_id, kind, model, price_table, cost_micros, at FROM draft_costs;

DROP TABLE draft_costs;

ALTER TABLE draft_costs_new RENAME TO draft_costs;

CREATE INDEX draft_costs_job ON draft_costs (source, board, posting_id);
