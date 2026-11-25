import { describe, expect, it, vi } from 'vitest';
import type { Adapter } from '#lib/models/types.ts';
import { chooseModel, PROVIDERS, setupStatus, type ProviderInfo } from './model.ts';

describe('chooseModel', () => {
	const fake: Adapter = { provider: 'other', send: vi.fn() };
	const make = vi.fn(() => fake);
	const other: ProviderInfo = {
		label: 'Other',
		keySetting: 'OTHER_KEY',
		defaultModel: 'claude-haiku-5-5',
		make
	};
	const providers = { ...PROVIDERS, other };
	const settings = (values: Record<string, string>) => (name: string) => values[name] ?? '';

	it('uses Anthropic and its default model unless told otherwise, keeping the key for the call', () => {
		const setup = chooseModel(
			providers,
			settings({ ANTHROPIC_API_KEY: 'sk' }),
			vi.fn<typeof fetch>()
		);
		expect(setup).toMatchObject({
			ok: true,
			model: 'claude-sonnet-5-5',
			apiKey: 'sk',
			label: 'Claude (Anthropic), claude-sonnet-5-5'
		});
		expect(setup.ok && setup.adapter.provider).toBe('anthropic');
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
			adapter: fake,
			model: 'claude-sonnet-5-5',
			apiKey: 'k2',
			label: 'Other, claude-sonnet-5-5'
		});
		expect(make).toHaveBeenCalledWith(fetcher);
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
		expect(choose({ ANTHROPIC_API_KEY: 'sk', DRAFT_MODEL: 'claude-latest' })).toEqual({
			ok: false,
			message:
				'Drafting isn’t set up: there’s no price on file for the model “claude-latest”, so the daily cap couldn’t be kept.'
		});
	});
});

describe('setupStatus', () => {
	const settings = (values: Record<string, string>) => (name: string) => values[name] ?? '';

	it('names the model when drafting is on, and gives the reason when it isn’t', () => {
		expect(
			setupStatus(
				chooseModel(PROVIDERS, settings({ ANTHROPIC_API_KEY: 'sk' }), vi.fn<typeof fetch>())
			)
		).toEqual({ ready: true, label: 'Claude (Anthropic), claude-sonnet-5-5' });
		expect(setupStatus(chooseModel(PROVIDERS, settings({}), vi.fn<typeof fetch>()))).toEqual({
			ready: false,
			reason: 'Drafting isn’t set up yet: the Worker has no API key.'
		});
	});
});
