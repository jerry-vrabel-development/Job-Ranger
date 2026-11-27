import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withText, type Board, type FetchedPosting } from '#lib/jobs/posting.ts';
import { planSync } from '#lib/jobs/sync.ts';
import type { Adapter, Answered, Failed, ModelRequest } from '#lib/models/types.ts';
import { PROMPT_VERSION } from '#lib/scoring/score.ts';
import { loadBoard, setPaused, writePlan } from './db.ts';
import { addFact, pasteFacts } from './facts.ts';
import { createInterest, setInterestPaused, listInterests } from './interests.ts';
import type { Setup } from './models/model.ts';
import { savePreferences } from './preferences.ts';
import {
	jobsToScore,
	profileVersion,
	scoreJob,
	scoreNewJobs,
	scoringProfile,
	scoringSpentOn,
	type JobToScore
} from './scoring.ts';
import { addBoard, migratedDb } from './test-db.ts';

const NOW = new Date('2026-11-26T11:23:00.000Z');
const board: Board = { source: 'ashby', token: 'example', company: 'Example Co' };

let db: D1Database;

function posting(id: string, text: string, postedAt: string | null): FetchedPosting {
	return withText(
		{
			source: 'ashby',
			board: 'example',
			id,
			company: 'Example Co',
			title: `Engineer ${id}`,
			location: 'Chicago, IL',
			workplace: 'hybrid',
			employmentType: null,
			department: id === 'a' ? 'Platform' : null,
			applyUrl: `https://jobs.ashbyhq.com/example/${id}`,
			jobUrl: null,
			postedAt,
			pay: null
		},
		text
	);
}

/** The first job waiting to be scored for profile p1; fails loudly if there's none. */
async function firstJob(): Promise<JobToScore> {
	const [job] = await jobsToScore(db, PROMPT_VERSION, 'p1', 1);
	if (job === undefined) throw new Error('no job to score');
	return job;
}

async function store(postings: FetchedPosting[]) {
	const plan = planSync(await loadBoard(db, board), postings, NOW.toISOString());
	await writePlan(db, board, plan, NOW.toISOString(), new Map(postings.map((p) => [p.id, p.text])));
}

/** A fake model: answers each call with the next result, and records what it was asked. */
function fakeModel(...results: (Answered | Failed)[]) {
	const asked: ModelRequest[] = [];
	const adapter: Adapter = {
		provider: 'anthropic',
		send: (request) => {
			asked.push(request);
			const next = results.shift();
			if (next === undefined) throw new Error('no more answers');
			return Promise.resolve(next);
		}
	};
	const setup: Extract<Setup, { ok: true }> = {
		ok: true,
		adapter,
		model: 'claude-haiku-5-5',
		apiKey: 'test-key',
		label: 'Claude (Anthropic), claude-haiku-5-5'
	};
	return { setup, asked };
}

function answered(output: unknown, stopReason: Answered['stopReason'] = 'end'): Answered {
	return {
		ok: true,
		text: '',
		output,
		model: 'claude-haiku-5-5',
		usage: { inputTokens: 3000, outputTokens: 300, reasoningTokens: null },
		stopReason,
		latencyMs: 900,
		raw: null
	};
}

const failed: Failed = {
	ok: false,
	error: { kind: 'auth', message: 'The API key was rejected.', status: 401, retryAfterMs: null },
	latencyMs: 50,
	raw: null
};

const good = (score = 4) => ({
	score,
	summary: 'It fits your TypeScript work.',
	reasons: [
		{ direction: 'for', text: 'It asks for TypeScript.', cites: [{ quote: 'need TypeScript' }] }
	]
});

beforeEach(async () => {
	db = await migratedDb();
	for (const table of [
		'job_scores',
		'posting_texts',
		'postings',
		'boards',
		'facts',
		'interests',
		'preferences'
	]) {
		await db.prepare(`DELETE FROM ${table}`).run();
	}
	await addBoard(db, board);
	await store([
		posting('a', 'We need TypeScript.', '2026-11-25T00:00:00Z'),
		posting('b', 'We need TypeScript and Go.', '2026-11-24T00:00:00Z'),
		posting('c', '', '2026-11-26T00:00:00Z'),
		posting('d', 'We need TypeScript.', null)
	]);
});

describe('scoringProfile', () => {
	it('sends confirmed, current facts, interests not paused, and preferences set', async () => {
		await addFact(db, {
			kind: 'skill',
			experience: 'professional',
			organization: 'Acme',
			period: '',
			text: 'TypeScript'
		});
		await pasteFacts(db, [
			{ kind: 'skill', experience: 'side', organization: '', period: '', text: 'Go' }
		]);
		await db
			.prepare(
				"INSERT INTO facts (kind, experience, organization, period, text, source, confirmed_at, retired_at) VALUES ('skill', 'professional', '', '', 'COBOL', 'typed', 'x', 'y')"
			)
			.run();
		await createInterest(db, { name: 'Drones', note: '', keywords: ['drone'] });
		await createInterest(db, { name: 'Music', note: '', keywords: ['music'] });
		const music = (await listInterests(db)).find((i) => i.name === 'Music');
		await setInterestPaused(db, music?.id ?? 0, true);
		await savePreferences(db, {
			workplaces: ['remote'],
			area: '',
			levels: [],
			payFloor: null,
			lookingFor: ''
		});

		const profile = await scoringProfile(db);
		expect(profile.facts.map((f) => f.text)).toEqual(['TypeScript']);
		expect(profile.interests.map((i) => i.name)).toEqual(['Drones']);
		expect(profile.preferences).toEqual({ where: 'Remote' });
	});

	it('gets a new version when anything it sends changes', async () => {
		const before = profileVersion(await scoringProfile(db));
		expect(profileVersion(await scoringProfile(db))).toBe(before);
		await addFact(db, {
			kind: 'skill',
			experience: 'professional',
			organization: '',
			period: '',
			text: 'Svelte'
		});
		expect(profileVersion(await scoringProfile(db))).not.toBe(before);
	});
});

describe('jobsToScore', () => {
	it('lists open jobs with text, newest first, not yet scored for this prompt and profile', async () => {
		expect((await jobsToScore(db, PROMPT_VERSION, 'p1', 10)).map((j) => j.id)).toEqual([
			'a',
			'b',
			'd'
		]);
		const { setup } = fakeModel(answered(good()));
		const first = await firstJob();
		await scoreJob(db, setup, first, await scoringProfile(db), 'p1');
		expect((await jobsToScore(db, PROMPT_VERSION, 'p1', 10)).map((j) => j.id)).toEqual(['b', 'd']);
		expect((await jobsToScore(db, PROMPT_VERSION, 'p2', 10)).map((j) => j.id)).toEqual([
			'a',
			'b',
			'd'
		]);
		expect((await jobsToScore(db, 'older', 'p1', 10)).map((j) => j.id)).toEqual(['a', 'b', 'd']);
	});

	it('leaves out closed jobs and paused companies', async () => {
		await store([posting('a', 'We need TypeScript.', '2026-11-25T00:00:00Z')]);
		expect((await jobsToScore(db, PROMPT_VERSION, 'p1', 10)).map((j) => j.id)).toEqual(['a']);
		await setPaused(db, 'ashby', 'example', true);
		expect(await jobsToScore(db, PROMPT_VERSION, 'p1', 10)).toEqual([]);
	});
});

describe('scoreJob', () => {
	it('asks the model with the job’s text and records a checked score with its trace', async () => {
		const { setup, asked } = fakeModel(answered(good()));
		const job = await firstJob();
		const result = await scoreJob(db, setup, job, await scoringProfile(db), 'p1');
		expect(result).toEqual({ kind: 'scored', costMicros: 450 });
		expect(asked[0]).toMatchObject({ model: 'claude-haiku-5-5', json: { name: 'score_job' } });
		expect(asked[0]?.user).toContain('We need TypeScript.');
		expect(asked[0]?.user).toContain('"team":"Platform"');
		expect(
			await db
				.prepare(
					'SELECT posting_id, prompt_version, profile_version, ok, score, summary, why, input_tokens, cost_micros, latency_ms FROM job_scores'
				)
				.first()
		).toEqual({
			posting_id: 'a',
			prompt_version: PROMPT_VERSION,
			profile_version: 'p1',
			ok: 1,
			score: 4,
			summary: 'It fits your TypeScript work.',
			why: '',
			input_tokens: 3000,
			cost_micros: 450,
			latency_ms: 900
		});
		const row = await db
			.prepare('SELECT reasons, dropped, grade FROM job_scores')
			.first<Record<string, string | number>>();
		expect(JSON.parse(String(row?.['reasons']))).toEqual([
			{
				direction: 'for',
				text: 'It asks for TypeScript.',
				cites: [{ quote: 'need TypeScript' }],
				sources: ['Posting: “need TypeScript”']
			}
		]);
		expect(row?.['dropped']).toBe('[]');
		expect(row?.['grade']).toBeGreaterThan(0);
	});

	it('records an unscored job, with why, when the answer can’t be used', async () => {
		const cases: [Answered, string][] = [
			[answered({ score: 9 }), 'The model’s answer wasn’t in the shape asked for.'],
			[answered(good(), 'refusal'), 'The model declined to score this job.'],
			[answered(good(), 'max_tokens'), 'The model’s answer was cut off before it finished.']
		];
		for (const [answer, why] of cases) {
			await db.prepare('DELETE FROM job_scores').run();
			const { setup } = fakeModel(answer);
			const job = await firstJob();
			expect(await scoreJob(db, setup, job, await scoringProfile(db), 'p1')).toEqual({
				kind: 'unscored',
				costMicros: 450
			});
			expect(await db.prepare('SELECT ok, score, why, grade FROM job_scores').first()).toEqual({
				ok: 0,
				score: null,
				why,
				grade: null
			});
		}
	});

	it('records nothing when the API doesn’t answer', async () => {
		const { setup } = fakeModel(failed);
		const job = await firstJob();
		expect(await scoreJob(db, setup, job, await scoringProfile(db), 'p1')).toEqual({
			kind: 'error',
			message: 'The API key was rejected.'
		});
		expect(await db.prepare('SELECT COUNT(*) AS n FROM job_scores').first()).toEqual({ n: 0 });
	});
});

describe('scoreNewJobs', () => {
	it('scores every waiting job under the cap, and counts its own spending by day', async () => {
		const { setup } = fakeModel(answered(good()), answered({ score: 9 }), answered(good(2)));
		expect(
			await scoreNewJobs(db, setup, { capMicros: 100_000, now: NOW, deadline: Infinity })
		).toEqual({
			scored: 2,
			unscored: 1,
			waiting: 0,
			spentMicros: 1350,
			stopped: null
		});
		expect(await scoringSpentOn(db, '2026-11-26')).toBe(1350);
		expect(await scoringSpentOn(db, '2026-11-25')).toBe(0);
		// Nothing left for this prompt and profile: no calls the next time.
		const again = fakeModel();
		expect(
			(await scoreNewJobs(db, again.setup, { capMicros: 100_000, now: NOW, deadline: Infinity }))
				.scored
		).toBe(0);
		expect(again.asked).toEqual([]);
	});

	it('stops at the cap, going over by at most one job', async () => {
		const { setup, asked } = fakeModel(answered(good()), answered(good()), answered(good()));
		expect(
			await scoreNewJobs(db, setup, { capMicros: 500, now: NOW, deadline: Infinity })
		).toMatchObject({
			scored: 2,
			waiting: 1,
			spentMicros: 900,
			stopped: 'cap'
		});
		expect(asked).toHaveLength(2);
	});

	it('stops when time is up, and on the first API failure', async () => {
		let now = 0;
		const timed = fakeModel(answered(good()), answered(good()));
		const clock = () => (now += 10);
		expect(
			await scoreNewJobs(db, timed.setup, { capMicros: 100_000, now: NOW, deadline: 25, clock })
		).toMatchObject({ scored: 2, waiting: 1, stopped: 'time' });

		await db.prepare('DELETE FROM job_scores').run();
		const broken = fakeModel(failed, answered(good()));
		expect(
			await scoreNewJobs(db, broken.setup, { capMicros: 100_000, now: NOW, deadline: Infinity })
		).toEqual({ scored: 0, unscored: 0, waiting: 3, spentMicros: 0, stopped: 'error' });
		expect(broken.asked).toHaveLength(1);
	});

	it('uses the real clock when none is given', async () => {
		const { setup } = fakeModel();
		vi.spyOn(Date, 'now').mockReturnValue(100);
		expect(
			await scoreNewJobs(db, setup, { capMicros: 100_000, now: NOW, deadline: 50 })
		).toMatchObject({
			stopped: 'time',
			waiting: 3
		});
		vi.restoreAllMocks();
	});
});
