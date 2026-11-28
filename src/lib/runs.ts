/**
 * A daily run as the app reads it (design note 0011). Counts and our own
 * words only. Fields are null until the run gets that far.
 */
export interface RunRecord {
	readonly id: number;
	/** ISO times. */
	readonly scheduledAt: string;
	readonly startedAt: string;
	readonly finishedAt: string | null;
	readonly fetch: {
		readonly boards: number;
		readonly ok: number;
		readonly failed: number;
		readonly added: number;
		readonly closed: number;
		readonly deferred: number;
	} | null;
	readonly scoring: 'off' | 'ran' | 'failed' | null;
	/** Present when scoring ran. */
	readonly scoringCounts: {
		readonly scored: number;
		readonly unscored: number;
		readonly waiting: number;
		readonly spentMicros: number;
		readonly stopped: 'cap' | 'time' | 'error' | null;
	} | null;
	readonly problem: string | null;
}
