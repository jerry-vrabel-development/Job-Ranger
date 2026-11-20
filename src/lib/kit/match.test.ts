import { describe, expect, it } from 'vitest';
import { contentText, findAiRule, isBasicField, matchQuestion } from './match.ts';

describe('matchQuestion', () => {
	it.each([
		['Are you legally authorized to work in the United States?', 'work_authorization'],
		['Will you now or in the future require sponsorship?', 'work_authorization'],
		['What are your salary expectations?', 'pay'],
		['Desired pay range for remote roles', 'pay'],
		['When could you start?', 'start_date'],
		['Are you open to relocating to Denver?', 'location'],
		['Where are you currently based?', 'location'],
		['How did you hear about this role?', 'how_heard'],
		['How do you use AI tools in your work?', 'ai_use'],
		['Why are you interested in this role?', 'why_role'],
		['Why do you want to join Zipline?', 'why_company'],
		['What excites you about our mission?', 'why_company'],
		['What is your greatest strength?', 'strengths'],
		['Describe a conflict with a coworker', 'challenge'],
		['Tell us about a mistake you made', 'mistake'],
		['Describe a time you mentored someone', 'leadership'],
		['Tell us about yourself', 'about_me']
	])('reads “%s” as %s', (label, question) => {
		expect(matchQuestion(label)).toBe(question);
	});

	it('says nothing when no type clearly fits', () => {
		expect(matchQuestion('LinkedIn Profile')).toBeNull();
		expect(matchQuestion('Pronouns')).toBeNull();
		// "said" and "detail" hold "ai" but not the word AI.
		expect(matchQuestion('What has a manager said in your reviews, in detail?')).toBeNull();
	});
});

describe('isBasicField', () => {
	it('knows name, contact and file fields, and only those', () => {
		expect(isBasicField(['first_name'])).toBe(true);
		expect(isBasicField(['resume', 'resume_text'])).toBe(true);
		expect(isBasicField(['question_123'])).toBe(false);
		expect(isBasicField(['resume', 'question_123'])).toBe(false);
		expect(isBasicField([])).toBe(false);
	});
});

describe('findAiRule', () => {
	it('finds a sentence that forbids AI-written answers', () => {
		expect(
			findAiRule(
				'We build civic tools. Please do not use AI tools such as ChatGPT to write your answers! We read every one.'
			)
		).toBe('Please do not use AI tools such as ChatGPT to write your answers!');
		expect(findAiRule('Applications written by generative AI will be disqualified.')).toBe(
			'Applications written by generative AI will be disqualified.'
		);
		expect(findAiRule('Answer in your own words; responses from LLMs are easy to spot.')).toBe(
			'Answer in your own words; responses from LLMs are easy to spot.'
		);
	});

	it('finds nothing in a posting that only talks about AI work', () => {
		expect(findAiRule('You will build AI features. We value kindness.')).toBeNull();
		expect(findAiRule('Not a word about the subject.')).toBeNull();
		expect(findAiRule('')).toBeNull();
	});

	it('shortens a very long sentence', () => {
		const rule = findAiRule(`Do not use AI ${'really '.repeat(100)}ever.`);
		expect(rule?.length).toBeLessThanOrEqual(498);
		expect(rule?.endsWith('…')).toBe(true);
	});
});

describe('contentText', () => {
	it('turns Greenhouse’s entity-written HTML into sentences', () => {
		expect(
			contentText(
				'&lt;h2&gt;About us&lt;/h2&gt;&lt;p&gt;We build &amp;amp; ship.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Don&amp;rsquo;t use AI&lt;/li&gt;&lt;/ul&gt;&lt;p&gt;Thanks&amp;nbsp;&amp;#8212; &amp;#x2764;&lt;br/&gt;&lt;/p&gt;'
			)
		).toBe('About us. We build & ship. Don’t use AI. Thanks — ❤.');
	});

	it('leaves unknown or impossible entities as written', () => {
		expect(contentText('&amp;bogus; &amp;#0; &amp;#x110000;')).toBe('&bogus; &#0; &#x110000;');
	});
});
