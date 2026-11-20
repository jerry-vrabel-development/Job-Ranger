/**
 * The one seam between Job Ranger and any language model (design note 0004,
 * decision 9). Drafting asks a provider for structured output through this
 * interface; the honesty checks run in plain code on whatever comes back, so
 * they hold whichever model writes. Add a provider by adding an adapter and
 * listing it in PROVIDERS, with its models' prices.
 */

/** Instructions, input and the shape the answer must fill. */
export interface StructuredCall {
	readonly model: string;
	readonly system: string;
	readonly user: string;
	readonly schema: {
		readonly name: string;
		readonly description: string;
		readonly input_schema: unknown;
	};
	readonly maxTokens: number;
}

export interface Usage {
	readonly inputTokens: number;
	readonly outputTokens: number;
}

export interface StructuredResult {
	/** The filled-in shape, or null when the model answered some other way. */
	readonly output: unknown;
	readonly usage: Usage;
}

export interface ModelProvider {
	structured(call: StructuredCall): Promise<StructuredResult>;
}

/** The call failed; the message is safe to show (no key, no prompt). */
export class ModelError extends Error {
	override readonly name = 'ModelError';
}

/**
 * Prices in millionths of a dollar per token. A model without a price can't
 * be used, because the daily cap couldn't be kept. Anthropic's pricing page,
 * checked Nov 20, 2026: Sonnet 5.5 $2 in / $10 out per million tokens; Haiku
 * 5.5 $0.10 / $0.50 for prompts up to 100,000 tokens.
 */
export const PRICES: Readonly<Record<string, { input: number; output: number }>> = {
	'claude-sonnet-5-5': { input: 2, output: 10 },
	'claude-haiku-5-5': { input: 0.1, output: 0.5 }
};

/** What a call cost, in millionths of a dollar, rounded up; null for a model with no price. */
export function costMicros(model: string, usage: Usage): number | null {
	const price = PRICES[model];
	if (price === undefined) return null;
	return Math.ceil(usage.inputTokens * price.input + usage.outputTokens * price.output);
}

export interface ProviderInfo {
	/** Shown on the page: "Claude (Anthropic)". */
	readonly label: string;
	/** The Worker secret holding this provider's key. */
	readonly keySetting: string;
	readonly defaultModel: string;
	make(fetcher: typeof fetch, apiKey: string): ModelProvider;
}

export type Setup =
	| {
			readonly ok: true;
			readonly provider: ModelProvider;
			readonly model: string;
			readonly label: string;
	  }
	| { readonly ok: false; readonly message: string };

/**
 * Which provider and model drafting uses, from the Worker's settings:
 * MODEL_PROVIDER (default "anthropic"), DRAFT_MODEL (default the provider's
 * own), and the provider's key secret.
 */
export function chooseModel(
	providers: Readonly<Record<string, ProviderInfo>>,
	setting: (name: string) => string,
	fetcher: typeof fetch
): Setup {
	const name = setting('MODEL_PROVIDER') || 'anthropic';
	const info = Object.hasOwn(providers, name) ? providers[name] : undefined;
	if (info === undefined) {
		return {
			ok: false,
			message: `Drafting isn’t set up: Job Ranger doesn’t know the model provider “${name}”. It knows: ${Object.keys(providers).join(', ')}.`
		};
	}
	const apiKey = setting(info.keySetting);
	if (apiKey === '') {
		return { ok: false, message: 'Drafting isn’t set up yet: the Worker has no API key.' };
	}
	const model = setting('DRAFT_MODEL') || info.defaultModel;
	if (!Object.hasOwn(PRICES, model)) {
		return {
			ok: false,
			message: `Drafting isn’t set up: there’s no price on file for the model “${model}”, so the daily cap couldn’t be kept.`
		};
	}
	return {
		ok: true,
		provider: info.make(fetcher, apiKey),
		model,
		label: `${info.label}, ${model}`
	};
}
