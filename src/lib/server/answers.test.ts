import { describe, expect, it } from 'vitest';
import { wordCount } from '#lib/answers.ts';
import { checkAnswer } from './answers.ts';

const good = {
	question: 'work_authorization',
	label: '',
	text: 'Yes. I am a US citizen and need no sponsorship.',
	origin: 'own',
	notes: ''
};

describe('checkAnswer', () => {
	it('keeps paragraphs, trims line ends, and squeezes long gaps', () => {
		const checked = checkAnswer({
			...good,
			label: '  150   words ',
			text: '\r\n  First paragraph.  \r\n\r\n\r\n\r\nSecond paragraph.\n\n',
			notes: ' dictated on a walk \n'
		});
		expect(checked).toEqual({
			ok: true,
			input: {
				...good,
				label: '150 words',
				text: 'First paragraph.\n\nSecond paragraph.',
				notes: 'dictated on a walk'
			}
		});
	});

	it.each([
		['question', { question: 'favourite_colour' }, /which question/],
		['question', { question: 'constructor' }, /which question/],
		['label', { label: 'x'.repeat(81) }, /under 80/],
		['text', { text: ' \n ' }, /Write the answer/],
		['text', { text: 'x'.repeat(5001) }, /under 5000/],
		['origin', { origin: 'ghostwritten' }, /how this answer was written/],
		['notes', { notes: 'x'.repeat(2001) }, /under 2000/]
	])('points at %s when it is wrong', (field, change, message) => {
		const checked = checkAnswer({ ...good, ...change });
		expect(checked).toMatchObject({ ok: false, field });
		expect(!checked.ok && checked.message).toMatch(message);
	});
});

describe('wordCount', () => {
	it('counts words the way a form limit would', () => {
		expect(wordCount('')).toBe(0);
		expect(wordCount('   \n ')).toBe(0);
		expect(wordCount('One')).toBe(1);
		// A spaced dash counts as a word, as most form limits count it.
		expect(wordCount('  Two words\n\nand a third — and more. ')).toBe(8);
	});
});
