import { describe, expect, it } from 'vitest';
import type { Adapter, Answered, Failed, ModelRequest } from '#lib/models/types.ts';
import { askModel, SCORE_MAX_OUTPUT, SCORE_TIMEOUT_MS, type Asker } from './ask.ts';
import { SCORE_TOOL, type Profile, type ScoringJob } from './score.ts';

const JOB: ScoringJob = {
	title: 'Frontend Engineer',
	company: 'Example',
	location: 'Remote',
	workplace: 'remote',
	department: null,
	postingText: 'We need TypeScript and Svelte.'
};
const PROFILE: Profile = { facts: [], interests: [], preferences: {} };

const answered = (output: unknown, stopReason: Answered['stopReason'] = 'end'): Answered => ({
	ok: true,
	text: '',
	output,
	model: 'claude-haiku-5-5',
	usage: { inputTokens: 3000, outputTokens: 300, reasoningTokens: null },
	stopReason,
	latencyMs: 900,
	raw: null
});

function asker(result: Answered | Failed): Asker & { asked: ModelRequest[] } {
	const asked: ModelRequest[] = [];
	const adapter: Adapter = {
		provider: 'anthropic',
		send: (request) => {
			asked.push(request);
			return Promise.resolve(result);
		}
	};
	return { adapter, model: 'claude-haiku-5-5', apiKey: 'test-key', asked };
}

const GOOD = {
	score: 4,
	summary: 'It asks for your skills.',
	reasons: [
		{ direction: 'for', text: 'TypeScript.', cites: [{ quote: 'need TypeScript' }] },
		{ direction: 'for', text: 'Made up.', cites: [{ quote: 'not in the posting' }] }
	]
};

describe('askModel', () => {
	it('asks with the scoring prompt and tool, then checks and prices the answer', async () => {
		const who = asker(answered(GOOD));
		const asked = await askModel(who, JOB, PROFILE);
		expect(who.asked[0]).toMatchObject({
			model: 'claude-haiku-5-5',
			maxOutputTokens: SCORE_MAX_OUTPUT,
			timeoutMs: SCORE_TIMEOUT_MS,
			json: SCORE_TOOL
		});
		expect(asked).toMatchObject({ ok: true, given: 2, model: 'claude-haiku-5-5', latencyMs: 900 });
		if (!asked.ok) throw new Error('expected an answer');
		expect(asked.checked).toMatchObject({ ok: true, score: 4 });
		// A reason left with no checkable citation is dropped whole: two notes, one reason.
		expect(asked.checked.dropped.map((drop) => drop.reason)).toEqual([1, 1]);
		expect(asked.cost.micros).toBeGreaterThan(0);
	});

	it('passes on a failed call, whether it’s worth retrying, and its wait', async () => {
		const failed: Failed = {
			ok: false,
			error: { kind: 'rate_limited', message: 'Slow down.', status: 429, retryAfterMs: 3000 },
			latencyMs: 10,
			raw: null
		};
		expect(await askModel(asker(failed), JOB, PROFILE)).toEqual({
			ok: false,
			message: 'Slow down.',
			retry: true,
			retryAfterMs: 3000
		});
		const refused: Failed = {
			...failed,
			error: { kind: 'auth', message: 'Key refused.', status: 401, retryAfterMs: null }
		};
		expect(await askModel(asker(refused), JOB, PROFILE)).toMatchObject({ ok: false, retry: false });
		const blocked: Failed = { ...failed, error: { ...refused.error, kind: 'refused' } };
		expect(await askModel(asker(blocked), JOB, PROFILE)).toMatchObject({ ok: false, retry: false });
	});

	it('says why a refused, cut off or misshapen answer can’t be used', async () => {
		const why = async (result: Answered) => {
			const asked = await askModel(asker(result), JOB, PROFILE);
			return asked.ok && !asked.checked.ok ? [asked.checked.why, asked.given] : null;
		};
		expect(await why(answered(GOOD, 'refusal'))).toEqual([
			'The model declined to score this job.',
			2
		]);
		expect(await why(answered(GOOD, 'max_tokens'))).toEqual([
			'The model’s answer was cut off before it finished.',
			2
		]);
		expect(await why(answered('not json'))).toEqual([
			'The model’s answer wasn’t in the shape asked for.',
			0
		]);
	});
});
