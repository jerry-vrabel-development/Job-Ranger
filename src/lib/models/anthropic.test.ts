import { describe, expect, it, vi } from 'vitest';
import {
	anthropic,
	anthropicBody,
	API_URL,
	API_VERSION,
	errorKindOf,
	readAnthropic,
	stopReasonOf
} from './anthropic.ts';
import { testAdapterContract } from './contract.ts';
import auth from './fixtures/anthropic/auth.json';
import maxTokens from './fixtures/anthropic/max-tokens.json';
import rateLimited from './fixtures/anthropic/rate-limited.json';
import refusal from './fixtures/anthropic/refusal.json';
import refused from './fixtures/anthropic/refused.json';
import serverError from './fixtures/anthropic/server-error.json';
import structured from './fixtures/anthropic/structured.json';
import success from './fixtures/anthropic/success.json';
import type { ModelRequest } from './types.ts';

testAdapterContract({
	make: (fetcher) => anthropic(fetcher),
	model: 'claude-sonnet-5-5',
	fixtures: { success, structured, maxTokens, refusal, auth, refused, rateLimited, serverError }
});

const request: ModelRequest = {
	model: 'claude-sonnet-5-5',
	system: 'Be brief.',
	user: 'Hi',
	maxOutputTokens: 100,
	timeoutMs: 5000
};

describe('the Anthropic request', () => {
	it('sends only what was asked: no temperature or effort unless set', () => {
		expect(anthropicBody(request)).toEqual({
			model: 'claude-sonnet-5-5',
			max_tokens: 100,
			system: 'Be brief.',
			messages: [{ role: 'user', content: 'Hi' }]
		});
		expect(
			anthropicBody({
				...request,
				temperature: 0,
				reasoning: 'low',
				json: { name: 'write_letter', description: 'd', schema: { type: 'object' } }
			})
		).toMatchObject({
			temperature: 0,
			output_config: { effort: 'low' },
			tools: [{ name: 'write_letter', description: 'd', input_schema: { type: 'object' } }],
			tool_choice: { type: 'auto' }
		});
	});

	it('posts to the Messages API with the version and the key in its header', async () => {
		const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(success.body)));
		await anthropic(fetcher).send(request, 'sk-test');
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe(API_URL);
		expect(init?.method).toBe('POST');
		expect(init?.headers).toMatchObject({
			'x-api-key': 'sk-test',
			'anthropic-version': API_VERSION
		});
		expect(init?.signal).toBeInstanceOf(AbortSignal);
	});
});

describe('reading Anthropic answers', () => {
	it('maps every stop reason, and HTTP statuses to error kinds', () => {
		expect(['end_turn', 'stop_sequence', 'tool_use'].map(stopReasonOf)).toEqual([
			'end',
			'end',
			'end'
		]);
		expect(stopReasonOf('max_tokens')).toBe('max_tokens');
		expect(stopReasonOf('refusal')).toBe('refusal');
		expect(stopReasonOf('pause_turn')).toBe('error');
		expect(stopReasonOf(undefined)).toBe('error');
		expect([401, 403, 429, 529, 400, 500].map(errorKindOf)).toEqual([
			'auth',
			'refused',
			'rate_limited',
			'rate_limited',
			'other',
			'other'
		]);
	});

	it('copes with odd bodies: missing parts become empty, never invented', () => {
		expect(readAnthropic(null, request, 5)).toEqual({
			ok: true,
			text: '',
			output: null,
			model: 'claude-sonnet-5-5',
			usage: { inputTokens: 0, outputTokens: 0, reasoningTokens: null },
			stopReason: 'error',
			latencyMs: 5,
			raw: null
		});
		const odd = readAnthropic(
			{
				content: [{ type: 'text', text: 7 }, 'x', { type: 'tool_use', name: 'write_letter' }],
				usage: { input_tokens: -1, output_tokens: 1.5 },
				model: 'claude-sonnet-5-5'
			},
			{ ...request, json: { name: 'write_letter', description: '', schema: {} } },
			1
		);
		expect(odd).toMatchObject({
			text: '',
			output: null,
			usage: { inputTokens: 0, outputTokens: 0 }
		});
		expect(readAnthropic({ content: 'none' }, request, 0).text).toBe('');
	});

	it('measures latency with the clock it is given', async () => {
		let now = 1000;
		const clock = () => (now += 250);
		const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(success.body)));
		const result = await anthropic(fetcher, clock).send(request, 'k');
		expect(result.latencyMs).toBe(250);
	});

	it('treats an answer that isn’t JSON as an error, keeping what it can', async () => {
		const html = vi.fn<typeof fetch>(() => Promise.resolve(new Response('<html>')));
		expect(await anthropic(html).send(request, 'k')).toMatchObject({
			ok: false,
			error: { kind: 'other', status: 200 },
			raw: null
		});
		const gone = vi.fn<typeof fetch>(() =>
			Promise.resolve(new Response('<html>', { status: 502 }))
		);
		expect(await anthropic(gone).send(request, 'k')).toMatchObject({
			ok: false,
			error: {
				kind: 'other',
				status: 502,
				message: 'Couldn’t draft: the API answered with an error (502).'
			}
		});
	});
});
