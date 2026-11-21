/**
 * The price table is data (prices.json), dated and versioned, not code. Each
 * call's cost is worked out from it and records the version used. A model
 * that isn't in the table can't be called, so every call can be priced and
 * only pinned ids are used.
 */
import table from './prices.json';
import type { Cost, ModelRequest, TokenUsage } from './types.ts';

export interface ModelPrice {
	readonly provider: string;
	readonly inputPerMTok: number;
	readonly outputPerMTok: number;
	readonly acceptsTemperature: boolean;
	readonly longPrompt?: {
		readonly overInputTokens: number;
		readonly inputPerMTok: number;
		readonly outputPerMTok: number;
	};
}

export interface PriceTable {
	readonly version: string;
	readonly source: string;
	readonly models: Readonly<Record<string, ModelPrice>>;
}

function isPrice(value: unknown): value is ModelPrice {
	if (typeof value !== 'object' || value === null) return false;
	const p = value as Record<string, unknown>;
	const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
	const long = p['longPrompt'];
	return (
		typeof p['provider'] === 'string' &&
		number(p['inputPerMTok']) &&
		number(p['outputPerMTok']) &&
		typeof p['acceptsTemperature'] === 'boolean' &&
		(long === undefined ||
			(typeof long === 'object' &&
				long !== null &&
				number((long as Record<string, unknown>)['overInputTokens']) &&
				number((long as Record<string, unknown>)['inputPerMTok']) &&
				number((long as Record<string, unknown>)['outputPerMTok'])))
	);
}

/** Checks a price table's shape, so a bad edit fails loudly, not as a wrong bill. */
export function readPriceTable(data: unknown): PriceTable {
	if (typeof data !== 'object' || data === null)
		throw new Error('The price table is not an object.');
	const { version, source, models } = data as Record<string, unknown>;
	if (typeof version !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(version)) {
		throw new Error('The price table needs a version date like 2026-11-20.');
	}
	if (typeof source !== 'string' || typeof models !== 'object' || models === null) {
		throw new Error('The price table needs a source and its models.');
	}
	for (const [id, price] of Object.entries(models)) {
		if (!isPrice(price)) throw new Error(`The price for ${id} is not the shape expected.`);
	}
	return { version, source, models: models as Record<string, ModelPrice> };
}

export const PRICES: PriceTable = readPriceTable(table);

export function priceOf(prices: PriceTable, model: string): ModelPrice | null {
	// Own entries only, so "constructor" isn't a model.
	const entry = Object.entries(prices.models).find(([id]) => id === model);
	return entry === undefined ? null : entry[1];
}

/** What a call cost at a price: the long-prompt rate when the prompt is over its line. */
export function priceCall(price: ModelPrice, version: string, usage: TokenUsage): Cost {
	const rate =
		price.longPrompt !== undefined && usage.inputTokens > price.longPrompt.overInputTokens
			? price.longPrompt
			: price;
	return {
		micros: Math.ceil(
			usage.inputTokens * rate.inputPerMTok + usage.outputTokens * rate.outputPerMTok
		),
		priceTable: version
	};
}

/** What a call cost, from the table, or null for a model it doesn't list. */
export function costOf(prices: PriceTable, model: string, usage: TokenUsage): Cost | null {
	const price = priceOf(prices, model);
	return price === null ? null : priceCall(price, prices.version, usage);
}

/** The model's price when the request can be sent, or why it can't, before anything is spent. */
export function checkRequest(
	prices: PriceTable,
	request: ModelRequest
):
	| { readonly ok: true; readonly price: ModelPrice }
	| { readonly ok: false; readonly message: string } {
	const price = priceOf(prices, request.model);
	if (price === null) {
		return {
			ok: false,
			message: `There’s no price on file for the model “${request.model}”, so it can’t be called.`
		};
	}
	if (request.temperature !== undefined && !price.acceptsTemperature) {
		return { ok: false, message: `The model “${request.model}” doesn’t accept a temperature.` };
	}
	return { ok: true, price };
}
