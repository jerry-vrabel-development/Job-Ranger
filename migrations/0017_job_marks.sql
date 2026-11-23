-- Saved and passed jobs (design note 0006, part 1). One mark per job: saved
-- to come back to, or passed on, with an optional note saying why. Passed
-- jobs drop off the job list until I ask to see them. No foreign key to
-- postings (see 0007); a company's marks go with it, like its kits.

CREATE TABLE job_marks (
	source TEXT NOT NULL,
	board TEXT NOT NULL,
	posting_id TEXT NOT NULL,
	mark TEXT NOT NULL CHECK (mark IN ('saved', 'passed')),
	note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 300),
	marked_at TEXT NOT NULL,
	PRIMARY KEY (source, board, posting_id)
) STRICT;

CREATE INDEX job_marks_mark ON job_marks (mark);
