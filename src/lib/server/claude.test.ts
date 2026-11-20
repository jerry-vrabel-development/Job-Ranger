import { describe, expect, it, vi } from 'vitest';
import {
	API_URL,
	API_VERSION,
	callTool,
	ClaudeError,
	costMicros,
	type ToolCall
} from './claude.ts';

const call: ToolCall = {
	model: 'claude-sonnet-5-5',
	system: 'Be brief.',
	user: '{"job":{}}',
	tool: { name: 'write_letter', description: 'd', input_schema: { type: 'object' } },
	maxTokens: 100
};

const answering = (body: unknown, init?: ResponseInit) =>
	vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, init)));

describe('costMicros', () => {
	it('prices tokens in millionths of a dollar, rounding up', () => {
		expect(costMicros('claude-sonnet-5-5', { inputTokens: 1000, outputTokens: 500 })).toBe(7000);
		expect(costMicros('claude-haiku-5-5', { inputTokens: 1000, outputTokens: 1 })).toBe(101);
		expect(costMicros('some-new-model', { inputTokens: 1, outputTokens: 0 })).toBe(2);
	});
});

describe('callTool', () => {
	it('sends one request with the key, version, prompt and tool, and returns the tool input', async () => {
		const fetcher = answering({
			content: [
				{ type: 'text', text: 'Here you go.' },
				{ type: 'tool_use', name: 'other', input: 'no' },
				{ type: 'tool_use', name: 'write_letter', input: { paragraphs: [] } }
			],
			usage: { input_tokens: 10, output_tokens: 20 }
		});
		expect(await callTool(fetcher, 'sk-test', call)).toEqual({
			input: { paragraphs: [] },
			usage: { inputTokens: 10, outputTokens: 20 }
		});
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe(API_URL);
		expect(init?.method).toBe('POST');
		expect(init?.headers).toMatchObject({
			'x-api-key': 'sk-test',
			'anthropic-version': API_VERSION
		});
		expect(JSON.parse(init?.body as string)).toMatchObject({
			model: 'claude-sonnet-5-5',
			max_tokens: 100,
			system: 'Be brief.',
			messages: [{ role: 'user', content: '{"job":{}}' }],
			tools: [{ name: 'write_letter' }],
			tool_choice: { type: 'auto' }
		});
	});

	it('returns no input when the model answers without the tool, and counts odd usage as zero', async () => {
		expect(
			await callTool(answering({ content: [{ type: 'text', text: 'Hi' }] }), 'k', call)
		).toEqual({
			input: null,
			usage: { inputTokens: 0, outputTokens: 0 }
		});
		expect(
			(
				await callTool(
					answering({ content: 'x', usage: { input_tokens: -1, output_tokens: '5' } }),
					'k',
					call
				)
			).usage
		).toEqual({ inputTokens: 0, outputTokens: 0 });
		expect((await callTool(answering(null), 'k', call)).input).toBeNull();
	});

	it('says why a call failed, without the key or prompt', async () => {
		const cases: [typeof fetch, string][] = [
			[answering({}, { status: 401 }), 'Couldn’t draft: the API key was refused.'],
			[
				answering({}, { status: 429 }),
				'Couldn’t draft: too many requests or the account’s spending limit was reached.'
			],
			[answering({}, { status: 529 }), 'Couldn’t draft: the API answered 529.'],
			[
				vi.fn<typeof fetch>(() => Promise.resolve(new Response('<html>'))),
				'Couldn’t draft: the API’s answer wasn’t JSON.'
			],
			[
				vi.fn<typeof fetch>(() => Promise.reject(new Error('offline'))),
				'The Claude API didn’t answer in time.'
			]
		];
		for (const [fetcher, message] of cases) {
			const error = await callTool(fetcher, 'sk-secret', call).catch((e: unknown) => e);
			expect(error).toBeInstanceOf(ClaudeError);
			expect((error as Error).message).toBe(message);
			expect((error as Error).message).not.toMatch(/sk-secret/);
		}
	});
});
