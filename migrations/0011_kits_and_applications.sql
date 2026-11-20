-- The apply kit (design note 0004, step 3): what Job Ranger knows about one
-- job's application form, and the record of what I applied to.
--
-- Like board_counts and board_interests, neither table has a foreign key to
-- boards (a boards rebuild would delete them). Removing a company deletes its
-- kits; applications are my history, so they keep the company and title and
-- stay even if the company or posting goes.

CREATE TABLE kits (
	source TEXT NOT NULL,
	board TEXT NOT NULL,
	posting_id TEXT NOT NULL,
	-- The form's questions as the job board gives them: [{label, required, basic}].
	questions TEXT NOT NULL DEFAULT '[]'
		CHECK (json_valid(questions) AND json_type(questions) = 'array'),
	-- Questions I pasted in from the form, one per line.
	pasted TEXT NOT NULL DEFAULT '' CHECK (length(pasted) <= 30000),
	-- What happened when the board was read, in words.
	read_note TEXT NOT NULL DEFAULT '' CHECK (length(read_note) <= 300),
	-- Whether the posting forbids AI-written answers, and who decided: the
	-- plain-code check, or me (my say is kept when the kit is read again).
	ai_rule TEXT NOT NULL DEFAULT 'unknown' CHECK (ai_rule IN ('unknown', 'none', 'forbids')),
	ai_sentence TEXT NOT NULL DEFAULT '' CHECK (length(ai_sentence) <= 500),
	ai_decided_by TEXT CHECK (ai_decided_by IN ('check', 'me')),
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	PRIMARY KEY (source, board, posting_id)
) STRICT;

CREATE TABLE applications (
	source TEXT NOT NULL,
	board TEXT NOT NULL,
	posting_id TEXT NOT NULL,
	company TEXT NOT NULL CHECK (length(company) BETWEEN 1 AND 200),
	title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
	applied_at TEXT NOT NULL,
	-- Ids of the saved answers the kit offered, for the record.
	answer_ids TEXT NOT NULL DEFAULT '[]'
		CHECK (json_valid(answer_ids) AND json_type(answer_ids) = 'array'),
	PRIMARY KEY (source, board, posting_id)
) STRICT;
