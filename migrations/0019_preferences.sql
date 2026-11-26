-- What I'm looking for (design note 0008, step 3). One row, all optional:
-- an empty value means "not a factor" when a job is scored.
--
-- Unlike profile (my contact details, never sent to a model), these are sent
-- to the model with my confirmed facts, so it can weigh them.
--
-- workplaces and levels are JSON arrays of known words; code checks which.

CREATE TABLE preferences (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	workplaces TEXT NOT NULL DEFAULT '[]'
		CHECK (json_valid(workplaces) AND json_type(workplaces) = 'array'),
	area TEXT NOT NULL DEFAULT '' CHECK (length(area) <= 100),
	levels TEXT NOT NULL DEFAULT '[]'
		CHECK (json_valid(levels) AND json_type(levels) = 'array'),
	pay_floor INTEGER CHECK (pay_floor IS NULL OR pay_floor BETWEEN 1 AND 10000000),
	looking_for TEXT NOT NULL DEFAULT '' CHECK (length(looking_for) <= 600),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
