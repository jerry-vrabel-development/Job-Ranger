import { describe, expect, it, vi } from 'vitest';
import { chooseModel, costMicros, type ModelProvider, type ProviderInfo } from './model.ts';
import { PROVIDERS } from './providers.ts';

describe('costMicros', () => {
	it('prices tokens in millionths of a dollar, rounding up, and knows no price for unknown models', () => {
		expect(costMicros('claude-sonnet-5-5', { inputTokens: 1000, outputTokens: 500 })).toBe(7000);
		expect(costMicros('claude-haiku-5-5', { inputTokens: 1000, outputTokens: 1 })).toBe(101);
		expect(costMicros('some-new-model', { inputTokens: 1, outputTokens: 0 })).toBeNull();
	});
});

describe('chooseModel', () => {
	const fake: ModelProvider = { structured: vi.fn() };
	const make = vi.fn(() => fake);
	const other: ProviderInfo = {
		label: 'Other',
		keySetting: 'OTHER_KEY',
		defaultModel: 'claude-haiku-5-5',
		make
	};
	const providers = { ...PROVIDERS, other };
	const settings = (values: Record<string, string>) => (name: string) => values[name] ?? '';

	it('uses Anthropic and its default model unless told otherwise', () => {
		const setup = chooseModel(
			providers,
			settings({ ANTHROPIC_API_KEY: 'sk' }),
			vi.fn<typeof fetch>()
		);
		expect(setup).toMatchObject({
			ok: true,
			model: 'claude-sonnet-5-5',
			label: 'Claude (Anthropic), claude-sonnet-5-5'
		});
	});

	it('picks another provider and model from the settings, with that provider’s key', () => {
		const fetcher = vi.fn<typeof fetch>();
		const setup = chooseModel(
			providers,
			settings({ MODEL_PROVIDER: 'other', OTHER_KEY: 'k2', DRAFT_MODEL: 'claude-sonnet-5-5' }),
			fetcher
		);
		expect(setup).toEqual({
			ok: true,
			provider: fake,
			model: 'claude-sonnet-5-5',
			label: 'Other, claude-sonnet-5-5'
		});
		expect(make).toHaveBeenCalledWith(fetcher, 'k2');
	});

	it('says why drafting isn’t set up', () => {
		const choose = (values: Record<string, string>) =>
			chooseModel(providers, settings(values), vi.fn<typeof fetch>());
		expect(choose({})).toEqual({
			ok: false,
			message: 'Drafting isn’t set up yet: the Worker has no API key.'
		});
		expect(choose({ MODEL_PROVIDER: 'other', ANTHROPIC_API_KEY: 'sk' })).toMatchObject({
			ok: false
		});
		expect(choose({ MODEL_PROVIDER: 'mystery' })).toEqual({
			ok: false,
			message:
				'Drafting isn’t set up: Job Ranger doesn’t know the model provider “mystery”. It knows: anthropic, other.'
		});
		expect(choose({ MODEL_PROVIDER: 'constructor' })).toMatchObject({ ok: false });
		expect(choose({ ANTHROPIC_API_KEY: 'sk', DRAFT_MODEL: 'unpriced-model' })).toEqual({
			ok: false,
			message:
				'Drafting isn’t set up: there’s no price on file for the model “unpriced-model”, so the daily cap couldn’t be kept.'
		});
	});
});
