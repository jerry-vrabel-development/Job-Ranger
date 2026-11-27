/**
 * Reading the published runs in evals/results/ for the eval page (design
 * note 0008). The files are ours, but they're edited by hand and outlive
 * the code that wrote them, so each is checked before it's shown: a file
 * that doesn't have the shape the page needs is skipped and counted, never
 * shown half-right. A run that stopped early is never published, and is
 * skipped here too if one slips in.
 */
import type { CaseResult } from './fixed-set.ts';
import type { Mean, Ranking, Share } from './metrics.ts';
import type { PublishedRun, Quality } from './run.ts';

type Data = Record<string, unknown>;

const isObject = (value: unknown): value is Data =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
	typeof value === 'number' && Number.isInteger(value) && value >= 0;

const isNumberOrNull = (value: unknown): boolean =>
	value === null || (typeof value === 'number' && Number.isFinite(value));

const isShare = (value: unknown): value is Share =>
	isObject(value) && isNumberOrNull(value['share']) && isCount(value['of']);

const isMean = (value: unknown): value is Mean =>
	isObject(value) && isNumberOrNull(value['mean']) && isCount(value['of']);

const KINDS = new Set(['fit', 'miss', 'trap']);

const isCase = (value: unknown): value is CaseResult =>
	isObject(value) &&
	typeof value['id'] === 'string' &&
	typeof value['kind'] === 'string' &&
	KINDS.has(value['kind']) &&
	isNumberOrNull(value['score']) &&
	typeof value['pass'] === 'boolean';

const isCases = (value: unknown): value is CaseResult[] =>
	Array.isArray(value) && value.every(isCase);

function isRanking(value: unknown): value is Ranking {
	if (!isObject(value) || !isObject(value['recall']) || !isObject(value['separation']))
		return false;
	const { recall, separation } = value;
	return (
		isShare(recall['10']) &&
		isShare(recall['25']) &&
		isShare(value['ndcg']) &&
		isMean(separation['wanted']) &&
		isMean(separation['notWanted']) &&
		isNumberOrNull(separation['gap'])
	);
}

function isLabels(value: unknown): boolean {
	if (value === null) return true;
	if (!isObject(value) || !isObject(value['skipped'])) return false;
	return (
		isCount(value['scored']) &&
		isCount(value['wanted']) &&
		isCount(value['exported']) &&
		isCount(value['skipped']['noText']) &&
		isCount(value['skipped']['unclear']) &&
		isRanking(value['model']) &&
		isRanking(value['baseline'])
	);
}

function isQuality(value: unknown): value is Quality {
	if (!isObject(value) || !isObject(value['costs'])) return false;
	return (
		isShare(value['faithfulness']) &&
		isShare(value['hardToRead']) &&
		isShare(value['unusable']) &&
		isShare(value['unstable']) &&
		isMean(value['costs']['microsPerJob']) &&
		isMean(value['costs']['msPerJob'])
	);
}

/** The run, if it's a finished run in the shape the page needs; otherwise null. */
export function readRun(data: unknown): PublishedRun | null {
	if (!isObject(data) || !isObject(data['fixed'])) return null;
	const ok =
		typeof data['promptVersion'] === 'string' &&
		typeof data['model'] === 'string' &&
		typeof data['at'] === 'string' &&
		!Number.isNaN(Date.parse(data['at'])) &&
		isCount(data['planned']) &&
		isCount(data['made']) &&
		isCount(data['spentMicros']) &&
		data['stopped'] === null &&
		isCases(data['fixed']['model']) &&
		isCases(data['fixed']['baseline']) &&
		isLabels(data['labels']) &&
		isQuality(data['quality']);
	return ok ? (data as unknown as PublishedRun) : null;
}

export interface Runs {
	/** Newest first. */
	readonly runs: readonly PublishedRun[];
	/** Files skipped because they weren't a finished run in the right shape. */
	readonly skipped: number;
}

/** Every readable run among the files, newest first. */
export function readRuns(files: Readonly<Record<string, unknown>>): Runs {
	const all = Object.values(files).map(readRun);
	const runs = all
		.filter((run): run is PublishedRun => run !== null)
		.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
	return { runs, skipped: all.length - runs.length };
}
