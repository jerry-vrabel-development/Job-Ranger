-- Each posting's text, for scoring (design note 0008, step 4a).
--
-- The daily fetch already receives it (Greenhouse `content`, Ashby and Lever
-- `descriptionPlain`; Breezy sends none). postings.text_hash is a fingerprint
-- of it, compared like any other detail, so an unchanged posting is only
-- touched and its text is never rewritten. The text lives in its own table,
-- written only when it's new or changed.
--
-- Existing postings start with an empty fingerprint, so the next fetch of each
-- board fills in their text.

ALTER TABLE postings ADD COLUMN text_hash TEXT NOT NULL DEFAULT '';

CREATE TABLE posting_texts (
	source TEXT NOT NULL,
	board TEXT NOT NULL,
	id TEXT NOT NULL,
	text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 30000),
	PRIMARY KEY (source, board, id),
	FOREIGN KEY (source, board, id) REFERENCES postings (source, board, id) ON DELETE CASCADE
) STRICT;
