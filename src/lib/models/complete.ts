/**
 * The one way to call a model: check the request against the price table,
 * send it through the provider's adapter, and price the answer. Never throws
 * for an API, network or setup problem: callers get a typed result.
 */
import { checkRequest, priceCall, PRICES, type PriceTable } from './prices.ts';
import type { Adapter, CallResult, ModelRequest } from './types.ts';

export async function complete(
	adapter: Adapter,
	request: ModelRequest,
	apiKey: string,
	prices: PriceTable = PRICES
): Promise<CallResult> {
	const check = checkRequest(prices, request);
	if (!check.ok) {
		return {
			ok: false,
			error: { kind: 'other', message: check.message, status: null, retryAfterMs: null },
			latencyMs: 0,
			raw: null
		};
	}
	const answer = await adapter.send(request, apiKey);
	if (!answer.ok) return answer;
	// Priced by the model asked for: it's the one in the table, and the one billed.
	return { ...answer, cost: priceCall(check.price, prices.version, answer.usage) };
}

/** Milliseconds from a Retry-After header (seconds or an HTTP date), or null. */
export function retryAfterMs(header: string | null, now = Date.now()): number | null {
	if (header === null || header.trim() === '') return null;
	const seconds = Number(header);
	if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
	const date = Date.parse(header);
	return Number.isNaN(date) ? null : Math.max(0, date - now);
}

/** True for the error an abort or timeout raises, in any runtime. */
export function isTimeout(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		((error as { name?: unknown }).name === 'TimeoutError' ||
			(error as { name?: unknown }).name === 'AbortError')
	);
}
