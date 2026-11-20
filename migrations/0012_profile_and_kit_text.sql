-- For the resume (design note 0004, step 3b).
--
-- profile: my name and contact details for the resume header. One row. Code
-- puts these on the resume; they are never sent to a model.
--
-- kits.posting_text: the posting's words (read from Greenhouse, or pasted in),
-- so the resume can pick facts that fit and the AI-rule check can read it.
-- kits.dismissed: skills the posting names that I said I don't have, so the
-- kit stops asking.

CREATE TABLE profile (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	name TEXT NOT NULL DEFAULT '' CHECK (length(name) <= 100),
	headline TEXT NOT NULL DEFAULT '' CHECK (length(headline) <= 150),
	email TEXT NOT NULL DEFAULT '' CHECK (length(email) <= 200),
	phone TEXT NOT NULL DEFAULT '' CHECK (length(phone) <= 40),
	location TEXT NOT NULL DEFAULT '' CHECK (length(location) <= 100),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

ALTER TABLE kits ADD COLUMN posting_text TEXT NOT NULL DEFAULT ''
	CHECK (length(posting_text) <= 30000);
ALTER TABLE kits ADD COLUMN dismissed TEXT NOT NULL DEFAULT '[]'
	CHECK (json_valid(dismissed) AND json_type(dismissed) = 'array');
