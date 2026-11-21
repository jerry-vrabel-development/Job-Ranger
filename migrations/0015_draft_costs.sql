-- What drafting cost, per job (design note 0004): one row per model call,
-- including calls the model declined or cut short, so the cost of applying
-- to each company is real, not estimated. model_usage keeps the daily totals
-- for the cap; this keeps the same spending by job.
--
-- applications.drafting_micros: what drafting for that job had cost when I
-- applied. No foreign key to boards (see 0007); a company's rows go with it.

CREATE TABLE draft_costs (
	id INTEGER PRIMARY KEY,
	source TEXT NOT NULL,
	board TEXT NOT NULL,
	posting_id TEXT NOT NULL,
	kind TEXT NOT NULL CHECK (kind IN ('letter_full', 'letter_short', 'answer')),
	-- The model id the API reported, and the price table version used.
	model TEXT NOT NULL,
	price_table TEXT NOT NULL,
	cost_micros INTEGER NOT NULL CHECK (cost_micros >= 0),
	at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX draft_costs_job ON draft_costs (source, board, posting_id);

ALTER TABLE applications ADD COLUMN drafting_micros INTEGER NOT NULL DEFAULT 0
	CHECK (drafting_micros >= 0);
