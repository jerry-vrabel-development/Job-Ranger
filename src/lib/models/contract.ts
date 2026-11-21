/**
 * The contract every model adapter must keep, as tests any adapter can run
 * with its own fixtures: one per scenario, in that provider's own response
 * format. Use it from an adapter's test file:
 *
 *     testAdapterContract({ make: (fetcher) => myAdapter(fetcher), model, fixtures });
 */
import { describe, expect, it, vi } from 'vitest';
import { complete } from './complete.ts';
import { PRICES } from './prices.ts';
import type { Adapter, ModelRequest } from './types.ts';

/** One recorded (or documented) API answer. */
export interface Fixture {
	readonly status: number;
	readonly headers: Readonly<Record<string, string>>;
	readonly body: unknown;
}

export interface ContractFixtures {
	/** A plain text answer that ended normally. */
	readonly success: Fixture;
	/** An answer that filled the requested JSON shape (named "write_letter"). */
	readonly structured: Fixture;
	readonly maxTokens: Fixture;
	readonly refusal: Fixture;
	/** 401: the key was refused. */
	readonly auth: Fixture;
	/** 403 or the provider's own "not allowed". */
	readonly refused: Fixture;
	/** 429 with a Retry-After of 20 seconds. */
	readonly rateLimited: Fixture;
	readonly serverError: Fixture;
}

export interface ContractOptions {
	readonly make: (fetcher: typeof fetch) => Adapter;
	/** A model this provider serves, from the price table. */
	readonly model: string;
	readonly fixtures: ContractFixtures;
}

const KEY = 'sk-contract-test-key';

export function testAdapterContract({ make, model, fixtures }: ContractOptions): void {
	const request: ModelRequest = {
		model,
		system: 'Be brief.',
		user: 'Say hello.',
		maxOutputTokens: 100,
		timeoutMs: 1000
	};
	const replying = (fixture: Fixture) =>
		vi.fn<typeof fetch>(() =>
			Promise.resolve(
				new Response(JSON.stringify(fixture.body), {
					status: fixture.status,
					headers: { 'content-type': 'application/json', ...fixture.headers }
				})
			)
		);
	const call = (fetcher: typeof fetch, over: Partial<ModelRequest> = {}) =>
		complete(make(fetcher), { ...request, ...over }, KEY);
	const keyless = (value: unknown) => {
		expect(JSON.stringify(value)).not.toContain(KEY);
	};

	describe(`the model adapter contract (${model})`, () => {
		it('answers in the shared shape, priced from the dated table', async () => {
			const result = await call(replying(fixtures.success));
			if (!result.ok) throw new Error(result.error.message);
			expect(result.text.length).toBeGreaterThan(0);
			expect(result.output).toBeNull();
			expect(typeof result.model).toBe('string');
			expect(Number.isSafeInteger(result.usage.inputTokens)).toBe(true);
			expect(Number.isSafeInteger(result.usage.outputTokens)).toBe(true);
			expect(result.usage.reasoningTokens === null || result.usage.reasoningTokens >= 0).toBe(true);
			expect(result.stopReason).toBe('end');
			expect(result.latencyMs).toBeGreaterThanOrEqual(0);
			expect(result.raw).toEqual(fixtures.success.body);
			expect(result.cost.priceTable).toBe(PRICES.version);
			expect(result.cost.micros).toBeGreaterThanOrEqual(0);
		});

		it('sends the key only as a credential, once, and never echoes it', async () => {
			const fetcher = replying(fixtures.success);
			const result = await call(fetcher);
			expect(fetcher).toHaveBeenCalledOnce();
			const init = fetcher.mock.calls[0]?.[1];
			expect(init?.body as string).not.toContain(KEY);
			expect(JSON.stringify(init?.headers)).toContain(KEY);
			keyless(result);
		});

		it('fills a requested JSON shape', async () => {
			const result = await call(replying(fixtures.structured), {
				json: { name: 'write_letter', description: 'A letter.', schema: { type: 'object' } }
			});
			expect(result.ok && result.output).toBeTruthy();
		});

		it('names why a call stopped', async () => {
			const stop = async (fixture: Fixture) => {
				const result = await call(replying(fixture));
				return result.ok ? result.stopReason : null;
			};
			expect(await stop(fixtures.maxTokens)).toBe('max_tokens');
			expect(await stop(fixtures.refusal)).toBe('refusal');
		});

		it('returns failures as typed results, without the key', async () => {
			const kinds: [Fixture, string, number | null][] = [
				[fixtures.auth, 'auth', null],
				[fixtures.refused, 'refused', null],
				[fixtures.rateLimited, 'rate_limited', 20_000],
				[fixtures.serverError, 'other', null]
			];
			for (const [fixture, kind, retryAfter] of kinds) {
				const result = await call(replying(fixture));
				expect(result).toMatchObject({
					ok: false,
					error: { kind, status: fixture.status, retryAfterMs: retryAfter }
				});
				keyless(result);
			}
		});

		it('turns a timeout and a lost network into typed results', async () => {
			const timedOut = vi.fn<typeof fetch>(() =>
				Promise.reject(new DOMException('The operation timed out.', 'TimeoutError'))
			);
			expect(await call(timedOut)).toMatchObject({
				ok: false,
				error: { kind: 'timeout', status: null }
			});
			const offline = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('fetch failed')));
			expect(await call(offline)).toMatchObject({
				ok: false,
				error: { kind: 'other', status: null }
			});
		});

		it('refuses an unpriced model or an unwanted temperature before sending anything', async () => {
			const fetcher = replying(fixtures.success);
			expect(await call(fetcher, { model: 'not-in-the-table' })).toMatchObject({
				ok: false,
				error: { kind: 'other' }
			});
			const price = PRICES.models[model];
			if (price !== undefined && !price.acceptsTemperature) {
				expect(await call(fetcher, { temperature: 0.2 })).toMatchObject({ ok: false });
			}
			expect(fetcher).not.toHaveBeenCalled();
		});
	});
}
