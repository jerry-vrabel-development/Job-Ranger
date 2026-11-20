-- The answer bank (design note 0004): ready answers to the questions most
-- application forms ask, tagged by question type and by how each was written.
-- "own" and "together" answers are my own words and may be reused anywhere,
-- including postings that forbid AI; "ai_edited" ones only where AI is allowed.

CREATE TABLE answers (
	id INTEGER PRIMARY KEY,
	question TEXT NOT NULL CHECK (
		question IN (
			'work_authorization', 'start_date', 'location', 'pay', 'how_heard', 'about_me',
			'why_company', 'why_role', 'strengths', 'challenge', 'mistake', 'leadership',
			'ai_use', 'other'
		)
	),
	-- A short name to tell versions apart: "150 words", "for nonprofits".
	label TEXT NOT NULL DEFAULT '' CHECK (length(label) <= 80),
	text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 5000),
	origin TEXT NOT NULL CHECK (origin IN ('own', 'together', 'ai_edited')),
	-- How it was made (fragments, dictation, dates): the receipts.
	notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
