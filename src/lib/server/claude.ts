/**
 * One call to the Claude Messages API, from the Worker, with the key from a
 * Worker secret (ANTHROPIC_API_KEY, set with `wrangler secret put`). Plain
 * fetch: no SDK to keep current. https://platform.claude.com/docs
 */

export const API_URL = 'https://api.anthropic.com/v1/messages';
export const API_VERSION = '2026-10-21';

export const DRAFT_MODEL = 'claude-sonnet-5-5';

/**
 * Prices in millionths of a dollar per token, from Anthropic's pricing page
 * (checked Nov 20, 2026): Sonnet 5.5 $2 in / $10 out per million tokens;
 * Haiku 5.5 $0.10 / $0.50 for prompts up to 100,000 tokens.
 */
export const PRICES: Readonly<Record<string, { input: number; output: number }>> = {
	'claude-sonnet-5-5': { input: 2, output: 10 },
	'claude-haiku-5-5': { input: 0.1, output: 0.5 }
};

export interface Usage {
	readonly inputTokens: number;
	readonly outputTokens: number;
}

/** What a call cost, in millionths of a dollar, rounded up. Unknown models cost as Sonnet. */
export function costMicros(model: string, usage: Usage): number {
	const price = PRICES[model] ?? { input: 2, output: 10 };
	return Math.ceil(usage.inputTokens * price.input + usage.outputTokens * price.output);
}

/** The call failed; the message is safe to show (no key, no prompt). */
export class ClaudeError extends Error {
	override readonly name = 'ClaudeError';
}

export interface ToolCall {
	readonly model: string;
	readonly system: string;
	readonly user: string;
	readonly tool: {
		readonly name: string;
		readonly description: string;
		readonly input_schema: unknown;
	};
	readonly maxTokens: number;
}

export interface ToolResult {
	/** The tool's input, or null when the model answered without calling the tool. */
	readonly input: unknown;
	readonly usage: Usage;
}

const DRAFT_TIMEOUT_MS = 90_000;

function tokens(value: unknown): number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export async function callTool(
	fetcher: typeof fetch,
	apiKey: string,
	call: ToolCall
): Promise<ToolResult> {
	let response: Response;
	try {
		response = await fetcher(API_URL, {
			method: 'POST',
			headers: {
				'x-api-key': apiKey,
				'anthropic-version': API_VERSION,
				'content-type': 'application/json'
			},
			body: JSON.stringify({
				model: call.model,
				max_tokens: call.maxTokens,
				system: call.system,
				messages: [{ role: 'user', content: call.user }],
				tools: [call.tool],
				tool_choice: { type: 'auto' }
			}),
			signal: AbortSignal.timeout(DRAFT_TIMEOUT_MS)
		});
	} catch {
		throw new ClaudeError('The Claude API didn’t answer in time.');
	}
	if (!response.ok) {
		const why =
			response.status === 401
				? 'the API key was refused'
				: response.status === 429
					? 'too many requests or the account’s spending limit was reached'
					: `the API answered ${String(response.status)}`;
		throw new ClaudeError(`Couldn’t draft: ${why}.`);
	}
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		throw new ClaudeError('Couldn’t draft: the API’s answer wasn’t JSON.');
	}
	const { content, usage } = (typeof body === 'object' && body !== null ? body : {}) as {
		content?: unknown;
		usage?: { input_tokens?: unknown; output_tokens?: unknown };
	};
	const block = Array.isArray(content)
		? (content as unknown[]).find(
				(item): item is { input: unknown } =>
					typeof item === 'object' &&
					item !== null &&
					(item as { type?: unknown }).type === 'tool_use' &&
					(item as { name?: unknown }).name === call.tool.name
			)
		: undefined;
	return {
		input: block === undefined ? null : block.input,
		usage: { inputTokens: tokens(usage?.input_tokens), outputTokens: tokens(usage?.output_tokens) }
	};
}
