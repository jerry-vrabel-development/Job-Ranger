/**
 * The Anthropic adapter: the Claude Messages API with plain fetch. The key
 * comes in per call and goes only into the request header. Structured output
 * is asked for as a tool; tool choice is left to the model, because the docs
 * don't say forcing a tool works with adaptive thinking.
 * https://platform.claude.com/docs
 */
import { isTimeout, retryAfterMs } from './complete.ts';
import type { Adapter, Answered, ErrorKind, Failed, ModelRequest, StopReason } from './types.ts';

export const API_URL = 'https://api.anthropic.com/v1/messages';
export const API_VERSION = '2026-10-21';

/** The request body for a call: what the API sees. */
export function anthropicBody(request: ModelRequest): Record<string, unknown> {
	return {
		model: request.model,
		max_tokens: request.maxOutputTokens,
		system: request.system,
		messages: [{ role: 'user', content: request.user }],
		...(request.temperature === undefined ? {} : { temperature: request.temperature }),
		...(request.reasoning === undefined ? {} : { output_config: { effort: request.reasoning } }),
		...(request.json === undefined
			? {}
			: {
					tools: [
						{
							name: request.json.name,
							description: request.json.description,
							input_schema: request.json.schema
						}
					],
					tool_choice: { type: 'auto' }
				})
	};
}

/** Anthropic's stop reasons, in the words every provider shares. */
export function stopReasonOf(value: unknown): StopReason {
	switch (value) {
		case 'end_turn':
		case 'stop_sequence':
		case 'tool_use':
			return 'end';
		case 'max_tokens':
			return 'max_tokens';
		case 'refusal':
			return 'refusal';
		default:
			// pause_turn (an unfinished turn) and anything new.
			return 'error';
	}
}

/** HTTP statuses, in the error kinds a retry policy needs. */
export function errorKindOf(status: number): ErrorKind {
	if (status === 401) return 'auth';
	if (status === 403) return 'refused';
	if (status === 429 || status === 529) return 'rate_limited';
	return 'other';
}

const MESSAGES: Readonly<Record<ErrorKind, string>> = {
	auth: 'the API key was refused',
	refused: 'the API refused this request',
	rate_limited: 'the API is busy, or the account’s rate or spending limit was reached',
	timeout: 'the API didn’t answer in time',
	other: 'the API answered with an error'
};

function tokens(value: unknown): number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads a Messages API response body into the shared result. */
export function readAnthropic(body: unknown, request: ModelRequest, latencyMs: number): Answered {
	const message = isObject(body) ? body : {};
	const content = Array.isArray(message['content']) ? message['content'] : [];
	const text = content
		.filter((block): block is Json => isObject(block) && block['type'] === 'text')
		.map((block) => (typeof block['text'] === 'string' ? block['text'] : ''))
		.join('');
	const tool =
		request.json === undefined
			? undefined
			: content.find(
					(block): block is Json =>
						isObject(block) && block['type'] === 'tool_use' && block['name'] === request.json?.name
				);
	const usage = isObject(message['usage']) ? message['usage'] : {};
	return {
		ok: true,
		text,
		output: tool === undefined ? null : (tool['input'] ?? null),
		model: typeof message['model'] === 'string' ? message['model'] : request.model,
		usage: {
			inputTokens: tokens(usage['input_tokens']),
			outputTokens: tokens(usage['output_tokens']),
			// The Messages API doesn't report thinking tokens separately.
			reasoningTokens: null
		},
		stopReason: stopReasonOf(message['stop_reason']),
		latencyMs,
		raw: body
	};
}

export function anthropic(fetcher: typeof fetch, clock: () => number = Date.now): Adapter {
	return {
		provider: 'anthropic',
		async send(request, apiKey): Promise<Answered | Failed> {
			const started = clock();
			const failed = (
				kind: ErrorKind,
				status: number | null,
				raw: unknown,
				retryAfter: number | null = null
			): Failed => ({
				ok: false,
				error: {
					kind,
					message: `Couldn’t draft: ${MESSAGES[kind]}${status === null || kind === 'timeout' ? '' : ` (${String(status)})`}.`,
					status,
					retryAfterMs: retryAfter
				},
				latencyMs: clock() - started,
				raw
			});
			let response: Response;
			try {
				response = await fetcher(API_URL, {
					method: 'POST',
					headers: {
						'x-api-key': apiKey,
						'anthropic-version': API_VERSION,
						'content-type': 'application/json'
					},
					body: JSON.stringify(anthropicBody(request)),
					signal: AbortSignal.timeout(request.timeoutMs)
				});
			} catch (error) {
				return isTimeout(error) ? failed('timeout', null, null) : failed('other', null, null);
			}
			let body: unknown = null;
			try {
				body = await response.json();
			} catch {
				// Not JSON: kept as null; a 2xx without a body is an error below.
			}
			if (!response.ok) {
				return failed(
					errorKindOf(response.status),
					response.status,
					body,
					retryAfterMs(response.headers.get('retry-after'))
				);
			}
			if (!isObject(body)) return failed('other', response.status, body);
			return readAnthropic(body, request, clock() - started);
		}
	};
}
