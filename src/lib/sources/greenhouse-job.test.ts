import { describe, expect, it, vi } from 'vitest';
import {
	fetchGreenhouseJob,
	greenhouseJobUrl,
	parseGreenhouseJob,
	QUESTIONS_MAX
} from './greenhouse-job.ts';
import { SourceFormatError, SourceHttpError } from './source.ts';

const job = {
	id: 101,
	title: 'Engineer',
	content: '&lt;p&gt;Please do not use AI to write your answers.&lt;/p&gt;',
	questions: [
		{ required: true, label: 'First Name', fields: [{ name: 'first_name', type: 'input_text' }] },
		{
			required: true,
			label: 'Resume/CV',
			fields: [
				{ name: 'resume', type: 'input_file' },
				{ name: 'resume_text', type: 'textarea' }
			]
		},
		{
			required: false,
			label: 'Why do you want to join us?',
			fields: ['odd', { type: 'no name' }, { name: 'question_1', type: 'textarea' }]
		},
		{ required: true, label: '  Are you authorized to work in the US?  ', fields: 'oops' },
		{ label: '' },
		'not a question'
	]
};

describe('parseGreenhouseJob', () => {
	it('reads the questions, marks the basic ones, and keeps the text for the AI check', () => {
		expect(parseGreenhouseJob(job)).toEqual({
			questions: [
				{ label: 'First Name', required: true, basic: true },
				{ label: 'Resume/CV', required: true, basic: true },
				{ label: 'Why do you want to join us?', required: false, basic: false },
				{ label: 'Are you authorized to work in the US?', required: true, basic: false }
			],
			text: 'Please do not use AI to write your answers.'
		});
	});

	it('keeps an empty text when there is no content, and stops at the question limit', () => {
		const many = Array.from({ length: QUESTIONS_MAX + 5 }, (_, i) => ({ label: `Q${String(i)}` }));
		const parsed = parseGreenhouseJob({ questions: many });
		expect(parsed.text).toBe('');
		expect(parsed.questions).toHaveLength(QUESTIONS_MAX);
	});

	it('fails loudly when the answer has no questions list', () => {
		expect(() => parseGreenhouseJob({ id: 1 })).toThrow(SourceFormatError);
		expect(() => parseGreenhouseJob([])).toThrow(SourceFormatError);
	});
});

describe('fetchGreenhouseJob', () => {
	it('asks the job board API for one job with its questions', async () => {
		expect(greenhouseJobUrl('civic co', '1/2')).toBe(
			'https://boards-api.greenhouse.io/v1/boards/civic%20co/jobs/1%2F2?questions=true'
		);
		const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(job)));
		expect((await fetchGreenhouseJob(fetcher, 'civic', '101')).questions).toHaveLength(4);
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe('https://boards-api.greenhouse.io/v1/boards/civic/jobs/101?questions=true');
		expect(init?.headers).toMatchObject({ accept: 'application/json' });
	});

	it('says why a job could not be read', async () => {
		const status = vi.fn<typeof fetch>(() =>
			Promise.resolve(new Response('gone', { status: 404 }))
		);
		await expect(fetchGreenhouseJob(status, 'civic', '1')).rejects.toThrow(SourceHttpError);
		const html = vi.fn<typeof fetch>(() => Promise.resolve(new Response('<html>')));
		await expect(fetchGreenhouseJob(html, 'civic', '1')).rejects.toThrow(SourceFormatError);
	});
});
