-- Model drafts (design note 0004, step 4) and what they cost.
--
-- drafts: the latest cover letter draft per job and length. Each sentence
-- keeps the ids of the facts it cites, and the code checks' findings are
-- stored with it. No foreign key to boards (see 0007); a company's drafts go
-- with its kits when it is removed.
--
-- model_usage: tokens and cost per day and model, for the daily spending cap.
-- Cost is in millionths of a dollar, so sums stay exact.

CREATE TABLE drafts (
	source TEXT NOT NULL,
	board TEXT NOT NULL,
	posting_id TEXT NOT NULL,
	kind TEXT NOT NULL CHECK (kind IN ('letter_full', 'letter_short')),
	paragraphs TEXT NOT NULL CHECK (json_valid(paragraphs) AND json_type(paragraphs) = 'array'),
	problems TEXT NOT NULL DEFAULT '[]'
		CHECK (json_valid(problems) AND json_type(problems) = 'array'),
	model TEXT NOT NULL,
	cost_micros INTEGER NOT NULL CHECK (cost_micros >= 0),
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	PRIMARY KEY (source, board, posting_id, kind)
) STRICT;

CREATE TABLE model_usage (
	day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	model TEXT NOT NULL,
	calls INTEGER NOT NULL DEFAULT 0 CHECK (calls >= 0),
	input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
	output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
	cost_micros INTEGER NOT NULL DEFAULT 0 CHECK (cost_micros >= 0),
	PRIMARY KEY (day, model)
) STRICT;
