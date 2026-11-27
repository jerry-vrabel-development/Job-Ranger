-- Scores and their traces (design note 0008, step 5). One row per scoring
-- call the model answered, kept per prompt version and profile version, so a
-- new prompt or a change to my facts, interests or preferences scores again.
--
-- ok = 1: the code checks passed; score, summary and reasons are what the
-- page shows. ok = 0: the job stays unscored and `why` says why; the call is
-- still recorded, with its cost. `dropped` lists what the checks removed.
-- Calls the API didn't answer (network, key, rate limit) aren't stored; the
-- run stops and tries again the next day.
--
-- No posting text or profile text is copied here; logs carry counts only.

CREATE TABLE job_scores (
	id INTEGER PRIMARY KEY,
	source TEXT NOT NULL,
	board TEXT NOT NULL,
	posting_id TEXT NOT NULL,
	prompt_version TEXT NOT NULL,
	profile_version TEXT NOT NULL,
	model TEXT NOT NULL,
	ok INTEGER NOT NULL CHECK (ok IN (0, 1)),
	-- IS NOT NULL is spelled out: a check on NULL is neither true nor false, so it would pass.
	score INTEGER CHECK (
		(ok = 1 AND score IS NOT NULL AND score BETWEEN 1 AND 5) OR (ok = 0 AND score IS NULL)
	),
	summary TEXT NOT NULL DEFAULT '' CHECK (length(summary) <= 1000),
	reasons TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(reasons) AND json_type(reasons) = 'array'),
	dropped TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(dropped) AND json_type(dropped) = 'array'),
	why TEXT NOT NULL DEFAULT '' CHECK (length(why) <= 500),
	grade REAL,
	input_tokens INTEGER NOT NULL CHECK (input_tokens >= 0),
	output_tokens INTEGER NOT NULL CHECK (output_tokens >= 0),
	cost_micros INTEGER NOT NULL CHECK (cost_micros >= 0),
	price_table TEXT NOT NULL,
	latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
	at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (source, board, posting_id) REFERENCES postings (source, board, id) ON DELETE CASCADE
) STRICT;

CREATE INDEX job_scores_job ON job_scores (source, board, posting_id, prompt_version, profile_version);
CREATE INDEX job_scores_at ON job_scores (at);
