/**
 * Which model Job Ranger drafts with, from the Worker's settings
 * (design note 0004, decision 9). The calls themselves go through the
 * runtime-neutral module in src/lib/models; this file only reads settings
 * and keeps the key out of everything but the call.
 */
import { anthropic } from '#lib/models/anthropic.ts';
import { priceOf, PRICES } from '#lib/models/prices.ts';
import type { Adapter } from '#lib/models/types.ts';

export interface ProviderInfo {
	/** Shown on the page: "Claude (Anthropic)". */
	readonly label: string;
	/** The Worker secret holding this provider's key. */
	readonly keySetting: string;
	readonly defaultModel: string;
	make(fetcher: typeof fetch): Adapter;
}

export const PROVIDERS: Readonly<Record<string, ProviderInfo>> = {
	anthropic: {
		label: 'Claude (Anthropic)',
		keySetting: 'ANTHROPIC_API_KEY',
		defaultModel: 'claude-sonnet-5-5',
		make: (fetcher) => anthropic(fetcher)
	}
};

export type Setup =
	| {
			readonly ok: true;
			readonly adapter: Adapter;
			readonly model: string;
			/** Passed to each call; never stored elsewhere or logged. */
			readonly apiKey: string;
			readonly label: string;
	  }
	| { readonly ok: false; readonly message: string };

/** What the model is for: drafting (0004) or scoring (0008). */
export interface ModelUse {
	/** The setting that names the model. */
	readonly modelSetting: string;
	/** The model when that setting is empty; null for the provider's own default. */
	readonly defaultModel: string | null;
	/** The word messages start with. */
	readonly word: string;
}

export const DRAFTING: ModelUse = {
	modelSetting: 'DRAFT_MODEL',
	defaultModel: null,
	word: 'Drafting'
};

/** Scoring every new job uses the cheap model unless SCORE_MODEL says otherwise (0008). */
export const SCORING: ModelUse = {
	modelSetting: 'SCORE_MODEL',
	defaultModel: 'claude-haiku-5-5',
	word: 'Scoring'
};

/**
 * MODEL_PROVIDER (default "anthropic"), the use's model setting (default the
 * use's model, else the provider's own; it must be in the price table), and
 * the provider's key secret.
 */
export function chooseModel(
	providers: Readonly<Record<string, ProviderInfo>>,
	setting: (name: string) => string,
	fetcher: typeof fetch,
	use: ModelUse = DRAFTING
): Setup {
	const name = setting('MODEL_PROVIDER') || 'anthropic';
	const info = Object.hasOwn(providers, name) ? providers[name] : undefined;
	if (info === undefined) {
		return {
			ok: false,
			message: `${use.word} isn’t set up: Job Ranger doesn’t know the model provider “${name}”. It knows: ${Object.keys(providers).join(', ')}.`
		};
	}
	const apiKey = setting(info.keySetting);
	if (apiKey === '') {
		return { ok: false, message: `${use.word} isn’t set up yet: the Worker has no API key.` };
	}
	const model = setting(use.modelSetting) || (use.defaultModel ?? info.defaultModel);
	if (priceOf(PRICES, model) === null) {
		return {
			ok: false,
			message: `${use.word} isn’t set up: there’s no price on file for the model “${model}”, so the daily cap couldn’t be kept.`
		};
	}
	return { ok: true, adapter: info.make(fetcher), model, apiKey, label: `${info.label}, ${model}` };
}

/** Whether drafting is set up, for a page to say: the model in use, or why it's off. */
export function setupStatus(
	setup: Setup
):
	| { readonly ready: true; readonly label: string }
	| { readonly ready: false; readonly reason: string } {
	return setup.ok ? { ready: true, label: setup.label } : { ready: false, reason: setup.message };
}
