import { describe, expect, it, vi } from 'vitest';
import type { Board } from '#lib/jobs/posting.ts';
import { ashby } from './ashby.ts';
import { fetchBoard, SourceFormatError, SourceHttpError, USER_AGENT } from './source.ts';

const board: Board = { source: 'ashby', token: 'example', company: 'Example Co' };

const answer = (body: BodyInit | null, status = 200) =>
	vi.fn<typeof fetch>(() => Promise.resolve(new Response(body, { status })));

describe('fetchBoard', () => {
	it('asks once, politely, and parses the board', async () => {
		const fetcher = answer(
			JSON.stringify({
				jobs: [{ id: 'a', title: 'Engineer', applyUrl: 'https://jobs.ashbyhq.com/example/a' }]
			})
		);
		const result = await fetchBoard(ashby, board, fetcher);
		expect(result.postings.map((p) => p.id)).toEqual(['a']);
		expect(fetcher).toHaveBeenCalledTimes(1);
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe(ashby.boardUrl('example'));
		expect(new Headers(init?.headers).get('user-agent')).toBe(USER_AGENT);
		expect(init?.signal).toBeInstanceOf(AbortSignal);
	});

	it('says a missing board is not found', async () => {
		await expect(fetchBoard(ashby, board, answer('nope', 404))).rejects.toThrow(
			'Board not found (404)'
		);
	});

	it('reports other error statuses', async () => {
		const failure = fetchBoard(ashby, board, answer('busy', 503));
		await expect(failure).rejects.toBeInstanceOf(SourceHttpError);
		await expect(failure).rejects.toThrow('Board answered 503');
	});

	it('fails loudly when the answer is not JSON', async () => {
		await expect(fetchBoard(ashby, board, answer('<html>'))).rejects.toBeInstanceOf(
			SourceFormatError
		);
	});
});
