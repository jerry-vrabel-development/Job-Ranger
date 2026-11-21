import { describe, expect, it } from 'vitest';
import { checkRequest, costOf, PRICES, priceCall, readPriceTable } from './prices.ts';
import { retryAfterMs, isTimeout } from './complete.ts';

describe('the price table', () => {
	it('is dated, sourced, and lists only models it can price', () => {
		expect(PRICES.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(PRICES.source).toMatch(/^https:\/\//);
		expect(Object.keys(PRICES.models)).toEqual(['claude-sonnet-5-5', 'claude-haiku-5-5']);
		for (const id of Object.keys(PRICES.models)) expect(id).not.toMatch(/latest/);
	});

	it('prices a call, using the long-prompt rate over its line', () => {
		const usage = { inputTokens: 1000, outputTokens: 500, reasoningTokens: null };
		expect(costOf(PRICES, 'claude-sonnet-5-5', usage)).toEqual({
			micros: 7000,
			priceTable: PRICES.version
		});
		expect(costOf(PRICES, 'claude-haiku-5-5', usage)?.micros).toBe(350);
		expect(
			costOf(PRICES, 'claude-haiku-5-5', {
				inputTokens: 100_001,
				outputTokens: 0,
				reasoningTokens: null
			})?.micros
		).toBe(50_001);
		expect(costOf(PRICES, 'nope', usage)).toBeNull();
		expect(costOf(PRICES, 'constructor', usage)).toBeNull();
		expect(
			priceCall(
				{ provider: 'x', inputPerMTok: 0.3, outputPerMTok: 0, acceptsTemperature: true },
				'v',
				{
					inputTokens: 1,
					outputTokens: 0,
					reasoningTokens: null
				}
			)
		).toEqual({ micros: 1, priceTable: 'v' });
	});

	it('checks a request before anything is spent', () => {
		const request = {
			model: 'claude-sonnet-5-5',
			system: '',
			user: '',
			maxOutputTokens: 1,
			timeoutMs: 1
		};
		expect(checkRequest(PRICES, request)).toMatchObject({ ok: true });
		expect(checkRequest(PRICES, { ...request, temperature: 0.5 })).toEqual({
			ok: false,
			message: 'The model “claude-sonnet-5-5” doesn’t accept a temperature.'
		});
		expect(checkRequest(PRICES, { ...request, model: 'gpt-latest' })).toEqual({
			ok: false,
			message: 'There’s no price on file for the model “gpt-latest”, so it can’t be called.'
		});
		const warm = readPriceTable({
			version: '2026-01-01',
			source: 's',
			models: { m: { provider: 'p', inputPerMTok: 1, outputPerMTok: 1, acceptsTemperature: true } }
		});
		expect(checkRequest(warm, { ...request, model: 'm', temperature: 0.5 })).toMatchObject({
			ok: true
		});
	});

	it('fails loudly on a price table in the wrong shape', () => {
		const good = { provider: 'p', inputPerMTok: 1, outputPerMTok: 1, acceptsTemperature: true };
		for (const bad of [
			null,
			{ version: 'today', source: 's', models: {} },
			{ version: '2026-01-01', models: {} },
			{ version: '2026-01-01', source: 's', models: null },
			{ version: '2026-01-01', source: 's', models: { m: null } },
			{ version: '2026-01-01', source: 's', models: { m: { ...good, inputPerMTok: -1 } } },
			{ version: '2026-01-01', source: 's', models: { m: { ...good, provider: 1 } } },
			{ version: '2026-01-01', source: 's', models: { m: { ...good, acceptsTemperature: 'no' } } },
			{ version: '2026-01-01', source: 's', models: { m: { ...good, longPrompt: null } } },
			{
				version: '2026-01-01',
				source: 's',
				models: { m: { ...good, longPrompt: { overInputTokens: 1 } } }
			}
		]) {
			expect(() => readPriceTable(bad)).toThrow();
		}
	});
});

describe('call helpers', () => {
	it('reads Retry-After in seconds or as a date', () => {
		expect(retryAfterMs(null)).toBeNull();
		expect(retryAfterMs(' ')).toBeNull();
		expect(retryAfterMs('20')).toBe(20_000);
		expect(retryAfterMs('1.5')).toBe(1500);
		expect(
			retryAfterMs('Wed, 21 Oct 2026 07:28:00 GMT', Date.parse('Wed, 21 Oct 2026 07:27:00 GMT'))
		).toBe(60_000);
		expect(
			retryAfterMs('Wed, 21 Oct 2026 07:28:00 GMT', Date.parse('Wed, 21 Oct 2026 08:00:00 GMT'))
		).toBe(0);
		expect(retryAfterMs('soon')).toBeNull();
	});

	it('knows a timeout or abort in any runtime', () => {
		expect(isTimeout(new DOMException('x', 'TimeoutError'))).toBe(true);
		expect(isTimeout(new DOMException('x', 'AbortError'))).toBe(true);
		expect(isTimeout(new TypeError('fetch failed'))).toBe(false);
		expect(isTimeout('timeout')).toBe(false);
		expect(isTimeout(null)).toBe(false);
	});
});
