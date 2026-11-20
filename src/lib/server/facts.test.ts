import { describe, expect, it } from 'vitest';
import { PASTE_MAX, shortText } from '#lib/facts.ts';
import { checkFact, parseId, parsePaste } from './facts.ts';

const good = {
	kind: 'accomplishment',
	experience: 'professional',
	organization: 'HIMSS',
	period: 'Oct 2018–Jan 2020',
	text: 'Led engineering for the enterprise digital platform.'
};

describe('checkFact', () => {
	it('tidies spaces and case, and keeps the fact', () => {
		expect(
			checkFact({
				...good,
				kind: ' Accomplishment ',
				experience: 'PROFESSIONAL',
				organization: '  HIMSS  ',
				text: '  Led   engineering\nfor the platform. '
			})
		).toEqual({
			ok: true,
			input: { ...good, text: 'Led engineering for the platform.' }
		});
	});

	it('reads "hobby" as a side project', () => {
		const checked = checkFact({ ...good, experience: 'hobby' });
		expect(checked.ok && checked.input.experience).toBe('side');
	});

	it.each([
		['kind', { kind: 'job' }, /what kind of fact/],
		['kind', { kind: 'constructor' }, /what kind of fact/],
		['experience', { experience: 'expert' }, /professional, side/],
		['organization', { organization: 'x'.repeat(101) }, /under 100/],
		['period', { period: 'x'.repeat(41) }, /under 40/],
		['text', { text: '   ' }, /Write the fact/],
		['text', { text: 'x'.repeat(501) }, /under 500/]
	])('points at %s when it is wrong', (field, change, message) => {
		const checked = checkFact({ ...good, ...change });
		expect(checked).toMatchObject({ ok: false, field });
		expect(!checked.ok && checked.message).toMatch(message);
	});

	it('lets where and when be empty', () => {
		expect(checkFact({ ...good, organization: '', period: '' }).ok).toBe(true);
	});
});

describe('parsePaste', () => {
	it('reads one fact per line, skipping blanks and # comments, and keeps | in the fact', () => {
		const parsed = parsePaste(
			[
				'# From my resume',
				'',
				'role | professional | HIMSS | 2018–2020 | Lead Engineer, Enterprise Digital Platforms',
				'skill|side|Quest Log||Cloudflare Workers | D1 | R2'
			].join('\r\n')
		);
		expect(parsed).toEqual({
			ok: true,
			facts: [
				{
					kind: 'role',
					experience: 'professional',
					organization: 'HIMSS',
					period: '2018–2020',
					text: 'Lead Engineer, Enterprise Digital Platforms'
				},
				{
					kind: 'skill',
					experience: 'side',
					organization: 'Quest Log',
					period: '',
					text: 'Cloudflare Workers | D1 | R2'
				}
			]
		});
	});

	it('adds nothing when any line is wrong, and says which lines', () => {
		expect(
			parsePaste(
				'role | professional | A | 2020 | Fine\nnot enough parts\njob | professional | A | | X'
			)
		).toEqual({
			ok: false,
			message:
				'Nothing was added. Line 2 needs five parts separated by |. Line 3: Choose what kind of fact this is (role, accomplishment, project, skill, education, link, other).'
		});
	});

	it('shows five problems and counts the rest', () => {
		const parsed = parsePaste(Array.from({ length: 8 }, () => 'nope').join('\n'));
		expect(!parsed.ok && parsed.message).toMatch(/Line 5 needs.*\. And 3 more\.$/);
		expect(!parsed.ok && parsed.message).not.toMatch(/Line 6/);
	});

	it('asks for something when the box is empty', () => {
		expect(parsePaste('\n# only a comment\n')).toEqual({
			ok: false,
			message: 'Paste at least one fact.'
		});
	});

	it(`takes up to ${String(PASTE_MAX)} facts at once`, () => {
		const line = (i: number) => `skill | professional | | | Skill ${String(i)}`;
		const lines = (n: number) => Array.from({ length: n }, (_, i) => line(i)).join('\n');
		expect(parsePaste(lines(PASTE_MAX)).ok).toBe(true);
		expect(parsePaste(lines(PASTE_MAX + 1))).toEqual({
			ok: false,
			message: `Paste up to ${String(PASTE_MAX)} facts at a time.`
		});
	});
});

describe('shortText and parseId', () => {
	it('shortens a long fact for a button name', () => {
		expect(shortText('Short fact.')).toBe('Short fact.');
		const long = shortText(`${'word '.repeat(20)}end`);
		expect(long.length).toBeLessThanOrEqual(58);
		expect(long.endsWith('…')).toBe(true);
	});

	it('reads an id from a form, and nothing else', () => {
		expect(parseId('42')).toBe(42);
		for (const bad of ['0', '-1', '1.5', '01', 'x', '', '9999999999999999', null, 3]) {
			expect(parseId(bad)).toBeNull();
		}
	});
});
