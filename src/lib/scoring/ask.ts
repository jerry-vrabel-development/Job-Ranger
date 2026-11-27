/**
 * One scoring call: ask the model about a job, then check its answer. The
 * daily run, "Score now" and the evals all go through here, so an eval
 * measures exactly what the app does. Nothing here touches the database.
 */
import { complete } from '#lib/models/complete.ts';
import type { Adapter, Cost, TokenUsage } from '#lib/models/types.ts';
import {
	checkAnswer,
	parseAnswer,
	SCORE_TOOL,
	systemPrompt,
	userPrompt,
	type Checked,
	type Profile,
	type ScoringJob
} from './score.ts';

export const SCORE_TIMEOUT_MS = 30_000;
export const SCORE_MAX_OUTPUT = 1_200;

/** Who to ask. The key goes to the call and nowhere else. */
export interface Asker {
	readonly adapter: Adapter;
	readonly model: string;
	readonly apiKey: string;
}

export type Asked =
	/** The call itself failed (network, key, rate limit): nothing to check. */
	| {
			readonly ok: false;
			readonly message: string;
			/** Worth one more try: a rate limit, a timeout, a server error. A refused key isn't. */
			readonly retry: boolean;
			readonly retryAfterMs: number | null;
	  }
	| {
			readonly ok: true;
			readonly checked: Checked;
			/** Reasons the model gave, before any were dropped. */
			readonly given: number;
			readonly model: string;
			readonly usage: TokenUsage;
			readonly cost: Cost;
			readonly latencyMs: number;
	  };

export async function askModel(asker: Asker, job: ScoringJob, profile: Profile): Promise<Asked> {
	const answer = await complete(
		asker.adapter,
		{
			model: asker.model,
			system: systemPrompt(),
			user: userPrompt(job, profile),
			maxOutputTokens: SCORE_MAX_OUTPUT,
			timeoutMs: SCORE_TIMEOUT_MS,
			json: SCORE_TOOL
		},
		asker.apiKey
	);
	if (!answer.ok) {
		const { kind, message, retryAfterMs } = answer.error;
		return { ok: false, message, retry: kind !== 'auth' && kind !== 'refused', retryAfterMs };
	}
	const checked: Checked =
		answer.stopReason === 'refusal'
			? { ok: false, why: 'The model declined to score this job.', dropped: [] }
			: answer.stopReason === 'max_tokens'
				? { ok: false, why: 'The model’s answer was cut off before it finished.', dropped: [] }
				: checkAnswer(answer.output, job, profile);
	return {
		ok: true,
		checked,
		given: parseAnswer(answer.output)?.reasons.length ?? 0,
		model: answer.model,
		usage: answer.usage,
		cost: answer.cost,
		latencyMs: answer.latencyMs
	};
}
