-- Where an application stands (design note 0006, part 2): its status, when
-- that last changed, an optional note, and when I last followed up. "No
-- reply" and follow-up reminders aren't stored: they're worked out from these
-- dates when a page loads, so nothing runs on a timer and nothing goes stale.

ALTER TABLE applications ADD COLUMN status TEXT NOT NULL DEFAULT 'applied'
	CHECK (status IN ('applied', 'interviewing', 'offer', 'rejected', 'withdrawn'));

-- When the status last changed; NULL means it hasn't since I applied.
ALTER TABLE applications ADD COLUMN status_at TEXT;

ALTER TABLE applications ADD COLUMN status_note TEXT NOT NULL DEFAULT ''
	CHECK (length(status_note) <= 300);

ALTER TABLE applications ADD COLUMN followed_up_at TEXT;
