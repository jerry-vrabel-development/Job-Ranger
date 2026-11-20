-- The fact bank (design note 0004): everything true about my work, as data.
-- Resumes, cover letters and answers will be built only from confirmed facts.
--
-- A fact pasted in (from a resume or letter that may have been drafted with
-- AI) starts unconfirmed; one typed in by hand is confirmed when it is added.
-- Retired facts are kept, so a record of what was sent can still name them.

CREATE TABLE facts (
	id INTEGER PRIMARY KEY,
	kind TEXT NOT NULL
		CHECK (kind IN ('role', 'accomplishment', 'project', 'skill', 'education', 'link', 'other')),
	text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 500),
	organization TEXT NOT NULL DEFAULT '' CHECK (length(organization) <= 100),
	-- When, in words: "2018–2020", "around 2009", "since 2003".
	period TEXT NOT NULL DEFAULT '' CHECK (length(period) <= 40),
	experience TEXT NOT NULL DEFAULT 'professional'
		CHECK (experience IN ('professional', 'side', 'learning')),
	source TEXT NOT NULL CHECK (source IN ('typed', 'pasted', 'gap')),
	confirmed_at TEXT,
	retired_at TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
