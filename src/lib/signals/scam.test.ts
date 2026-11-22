import { describe, expect, it } from 'vitest';
import { scamSignals } from './scam.ts';

const labels = (text: string) => scamSignals(text).map((flag) => flag.label);

describe('scamSignals', () => {
	it('quotes the sentence each flag was found in', () => {
		expect(
			scamSignals('Great team. You will need to purchase a starter kit before day one. Apply now.')
		).toEqual([
			{
				label: 'Asks you to pay',
				why: expect.stringMatching(/^Real employers don’t charge you/) as string,
				quote: 'You will need to purchase a starter kit before day one.'
			}
		]);
	});

	it('finds each pattern scams use', () => {
		expect(labels('A $50 training fee is due at signup.')).toEqual(['Asks you to pay']);
		expect(
			labels('We will mail you a check to buy your office setup from our approved vendor.')
		).toEqual(['Check for equipment']);
		expect(labels('Equipment is bought with a check we send you.')).toEqual([
			'Check for equipment'
		]);
		expect(labels('Send your resume to hr.dept.jobs@gmail.com today.')).toEqual([
			'Free email address'
		]);
		expect(labels('Contact the recruiter on Telegram for next steps.')).toEqual([
			'Chat-app contact'
		]);
		expect(labels('Your interview will be held over WhatsApp.')).toEqual(['Chat-app contact']);
		expect(labels('Reach us by text message only.')).toEqual(['Chat-app contact']);
		expect(labels('Please install our meeting app before the call.')).toEqual([
			'Run their software'
		]);
		expect(labels('Clone the repository and run npm start to begin the test.')).toEqual([
			'Run their software'
		]);
		expect(labels('Connect your wallet to receive the signing bonus.')).toEqual([
			'Run their software'
		]);
	});

	it('reports each kind once, in a fixed order, and trims long sentences', () => {
		const text = [
			'Text us on WhatsApp.',
			'Contact us on Telegram.',
			'Write to boss@yahoo.com.',
			`A training fee applies ${'and more '.repeat(30)}.`
		].join('\n');
		const flags = scamSignals(text);
		expect(flags.map((f) => f.label)).toEqual([
			'Asks you to pay',
			'Free email address',
			'Chat-app contact'
		]);
		expect(flags[0]?.quote).toMatch(/…$/);
		expect(flags[2]?.quote).toBe('Text us on WhatsApp.');
	});

	it('stays quiet on ordinary postings, including ones that mention the same words', () => {
		const ordinary = [
			'We pay for your training and certifications.',
			'We’ll send you a laptop and a $500 home-office budget.',
			'All offers depend on a background check.',
			'You’ll build features for our WhatsApp and Telegram integrations.',
			'Email careers@example.com with questions.',
			'Our take-home asks you to sketch an API design; no code runs on your machine.',
			'Interviews are on Zoom or Google Meet.',
			'Signal processing experience is a plus.',
			'You’ll run daily equipment checks on the line.',
			''
		].join('\n');
		expect(scamSignals(ordinary)).toEqual([]);
	});
});
