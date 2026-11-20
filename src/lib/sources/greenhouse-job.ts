/**
 * One Greenhouse job, with its application questions, for the apply kit.
 * GET https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{id}?questions=true
 * (https://docs.greenhouse.io/job-board.html). One keyless GET, made only
 * when I open a job's kit, never by the daily fetch.
 */
import { cleanText } from '#lib/jobs/posting.ts';
import { contentText, isBasicField } from '#lib/kit/match.ts';
import { FETCH_TIMEOUT_MS, SourceFormatError, SourceHttpError, USER_AGENT } from './source.ts';

export interface FormQuestion {
	readonly label: string;
	readonly required: boolean;
	/** Name, email, phone, resume or cover letter: filled in by hand, not from the answer bank. */
	readonly basic: boolean;
}

export interface JobDetails {
	readonly questions: readonly FormQuestion[];
	/** The posting's text, for the AI-rule check. */
	readonly text: string;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function greenhouseJobUrl(board: string, id: string): string {
	return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${encodeURIComponent(id)}?questions=true`;
}

/** Most questions one kit keeps; a longer form is unusual and would be read on the page itself. */
export const QUESTIONS_MAX = 60;

export function parseGreenhouseJob(body: unknown): JobDetails {
	if (!isObject(body) || !Array.isArray(body['questions'])) {
		throw new SourceFormatError('Greenhouse job has no questions list');
	}
	const questions: FormQuestion[] = [];
	for (const item of body['questions']) {
		if (!isObject(item)) continue;
		const label = cleanText(item['label'], 500);
		if (!label) continue;
		const names = Array.isArray(item['fields'])
			? item['fields'].flatMap((field) =>
					isObject(field) && typeof field['name'] === 'string' ? [field['name']] : []
				)
			: [];
		questions.push({ label, required: item['required'] === true, basic: isBasicField(names) });
		if (questions.length === QUESTIONS_MAX) break;
	}
	const content = typeof body['content'] === 'string' ? contentText(body['content']) : '';
	return { questions, text: content };
}

export async function fetchGreenhouseJob(
	fetcher: typeof fetch,
	board: string,
	id: string
): Promise<JobDetails> {
	const response = await fetcher(greenhouseJobUrl(board, id), {
		headers: { accept: 'application/json', 'user-agent': USER_AGENT },
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
	});
	if (!response.ok) throw new SourceHttpError(response.status);
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		throw new SourceFormatError('The job did not answer with JSON');
	}
	return parseGreenhouseJob(body);
}
