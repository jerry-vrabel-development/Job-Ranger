-- Drafted answers to single application questions (design note 0004, step
-- 4b): the latest draft per job and question, with the facts each sentence
-- cites and the code checks' findings. Kept until I edit one into my answer
-- bank (then it's deleted) or the company is removed. No foreign key to
-- boards (see 0007).

CREATE TABLE answer_drafts (
	source TEXT NOT NULL,
	board TEXT NOT NULL,
	posting_id TEXT NOT NULL,
	question TEXT NOT NULL CHECK (length(question) BETWEEN 1 AND 500),
	paragraphs TEXT NOT NULL CHECK (json_valid(paragraphs) AND json_type(paragraphs) = 'array'),
	problems TEXT NOT NULL DEFAULT '[]'
		CHECK (json_valid(problems) AND json_type(problems) = 'array'),
	model TEXT NOT NULL,
	cost_micros INTEGER NOT NULL CHECK (cost_micros >= 0),
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	PRIMARY KEY (source, board, posting_id, question)
) STRICT;
