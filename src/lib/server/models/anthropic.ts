/**
 * The Anthropic adapter: the Claude Messages API, with the key from a Worker
 * secret (ANTHROPIC_API_KEY). Plain fetch, no SDK to keep current. The shape
 * is asked for as a tool; tool choice is left to the model, because the docs
 * don't say forcing a tool works with adaptive thinking.
 * https://platform.claude.com/docs
 */
import { ModelError, type ModelProvider, type ProviderInfo } from './model.ts';

export const API_URL = 'https://api.anthropic.com/v1/messages';
export const API_VERSION = '2026-10-21';

const TIMEOUT_MS = 90_000;

function tokens(value: unknown): number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function anthropic(fetcher: typeof fetch, apiKey: string): ModelProvider {
	return {
		async structured(call) {
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
						tools: [call.schema],
						tool_choice: { type: 'auto' }
					}),
					signal: AbortSignal.timeout(TIMEOUT_MS)
				});
			} catch {
				throw new ModelError('The Claude API didn’t answer in time.');
			}
			if (!response.ok) {
				const why =
					response.status === 401
						? 'the API key was refused'
						: response.status === 429
							? 'too many requests or the account’s spending limit was reached'
							: `the API answered ${String(response.status)}`;
				throw new ModelError(`Couldn’t draft: ${why}.`);
			}
			let body: unknown;
			try {
				body = await response.json();
			} catch {
				throw new ModelError('Couldn’t draft: the API’s answer wasn’t JSON.');
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
							(item as { name?: unknown }).name === call.schema.name
					)
				: undefined;
			return {
				output: block === undefined ? null : block.input,
				usage: {
					inputTokens: tokens(usage?.input_tokens),
					outputTokens: tokens(usage?.output_tokens)
				}
			};
		}
	};
}

export const ANTHROPIC: ProviderInfo = {
	label: 'Claude (Anthropic)',
	keySetting: 'ANTHROPIC_API_KEY',
	defaultModel: 'claude-sonnet-5-5',
	make: anthropic
};
