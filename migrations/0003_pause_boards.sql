-- A company can be paused: the daily fetch skips it and its jobs are hidden,
-- but its history stays. Adding a column with a default is a plain ALTER, so
-- the running Worker never sees a broken table.
ALTER TABLE boards ADD COLUMN paused INTEGER NOT NULL DEFAULT 0 CHECK (paused IN (0, 1));
