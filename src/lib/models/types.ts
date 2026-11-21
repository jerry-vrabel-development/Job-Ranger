/**
 * The model call contract (design note 0004, decision 9). Runtime-neutral:
 * nothing here, nor in any adapter, may use Node- or Worker-only APIs; only
 * fetch, AbortSignal and plain data, so the same module runs in a Worker, a
 * browser and Node. The key is passed in per call and never stored or logged.
 */

/** Optional reasoning effort; the provider's default when left out. */
export type Reasoning = 'low' | 'medium' | 'high';

export interface ModelRequest {
	/** A pinned model id (a snapshot, never a "latest" alias); it must be in the price table. */
	readonly model: string;
	readonly system: string;
	readonly user: string;
	readonly maxOutputTokens: number;
	/** Left out unless set; some models reject it (the price table says which). */
	readonly temperature?: number;
	readonly reasoning?: Reasoning;
	readonly timeoutMs: number;
	/**
	 * Optional structured output: the model fills this JSON shape and the
	 * result's `output` holds it. Job Ranger needs it for cited sentences;
	 * callers that only want text leave it out.
	 */
	readonly json?: {
		readonly name: string;
		readonly description: string;
		readonly schema: unknown;
	};
}

/** Why a call stopped, the same words for every provider. */
export type StopReason = 'end' | 'max_tokens' | 'refusal' | 'error';

export interface TokenUsage {
	readonly inputTokens: number;
	readonly outputTokens: number;
	/** Reasoning tokens when the API reports them separately; null when it doesn't. */
	readonly reasoningTokens: number | null;
}

export interface Cost {
	/** Millionths of a dollar, rounded up. */
	readonly micros: number;
	/** The price table version that produced it ("2026-11-20"). */
	readonly priceTable: string;
}

/** What an adapter returns from a call the API answered. */
export interface Answered {
	readonly ok: true;
	readonly text: string;
	/** The structured output, when `json` was asked for and the model filled it; else null. */
	readonly output: unknown;
	/** The model id exactly as the API reports it. */
	readonly model: string;
	readonly usage: TokenUsage;
	readonly stopReason: StopReason;
	readonly latencyMs: number;
	/** The response body as received, for audit. Never holds the key. */
	readonly raw: unknown;
}

/** Failures callers can apply one retry policy to. */
export type ErrorKind = 'rate_limited' | 'timeout' | 'auth' | 'refused' | 'other';

export interface Failed {
	readonly ok: false;
	readonly error: {
		readonly kind: ErrorKind;
		/** Safe to show: never the key or the prompt. */
		readonly message: string;
		readonly status: number | null;
		/** How long the API asked us to wait, when it said. */
		readonly retryAfterMs: number | null;
	};
	readonly latencyMs: number;
	readonly raw: unknown;
}

/** A completed call, with what it cost. */
export type Completed = Answered & { readonly cost: Cost };

export type CallResult = Completed | Failed;

/** One provider. Adapters never throw for an API or network problem; they return Failed. */
export interface Adapter {
	readonly provider: string;
	send(request: ModelRequest, apiKey: string): Promise<Answered | Failed>;
}
