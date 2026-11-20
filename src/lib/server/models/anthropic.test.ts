import { describe, expect, it, vi } from 'vitest';
import { anthropic, ANTHROPIC, API_URL, API_VERSION } from './anthropic.ts';
import { ModelError, type StructuredCall } from './model.ts';

const call: StructuredCall = {
	model: 'claude-sonnet-5-5',
	system: 'Be brief.',
	user: '{"job":{}}',
	schema: { name: 'write_letter', description: 'd', input_schema: { type: 'object' } },
	maxTokens: 100
};

const answering = (body: unknown, init?: ResponseInit) =>
	vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, init)));

describe('the Anthropic adapter', () => {
	it('sends one request with the key, version, prompt and tool, and returns the tool input', async () => {
		const fetcher = answering({
			content: [
				{ type: 'text', text: 'Here you go.' },
				{ type: 'tool_use', name: 'other', input: 'no' },
				{ type: 'tool_use', name: 'write_letter', input: { paragraphs: [] } }
			],
			usage: { input_tokens: 10, output_tokens: 20 }
		});
		expect(await anthropic(fetcher, 'sk-test').structured(call)).toEqual({
			output: { paragraphs: [] },
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

	it('returns no output when the model answers without the tool, and counts odd usage as zero', async () => {
		const ask = (body: unknown) => anthropic(answering(body), 'k').structured(call);
		expect(await ask({ content: [{ type: 'text', text: 'Hi' }] })).toEqual({
			output: null,
			usage: { inputTokens: 0, outputTokens: 0 }
		});
		expect(
			(await ask({ content: 'x', usage: { input_tokens: -1, output_tokens: '5' } })).usage
		).toEqual({
			inputTokens: 0,
			outputTokens: 0
		});
		expect((await ask(null)).output).toBeNull();
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
			const error = await anthropic(fetcher, 'sk-secret')
				.structured(call)
				.catch((e: unknown) => e);
			expect(error).toBeInstanceOf(ModelError);
			expect((error as Error).message).toBe(message);
			expect((error as Error).message).not.toMatch(/sk-secret/);
		}
	});

	it('describes itself for the provider list', () => {
		expect(ANTHROPIC).toMatchObject({
			label: 'Claude (Anthropic)',
			keySetting: 'ANTHROPIC_API_KEY',
			defaultModel: 'claude-sonnet-5-5'
		});
		expect(ANTHROPIC.make(vi.fn<typeof fetch>(), 'k')).toHaveProperty('structured');
	});
});
