import { describe, expect, it } from 'vitest';
import { SKILLS, skillsIn, words } from './skills.ts';

describe('skillsIn', () => {
	it('finds skills as whole words, in any case, once each, in list order', () => {
		expect(
			skillsIn('We use React. Also TYPESCRIPT, react and Node.js (with C++ and C#). Kubernetes!')
		).toEqual(['TypeScript', 'C#', 'C++', 'React', 'Node.js', 'Kubernetes']);
	});

	it('finds phrases, and not words inside other words', () => {
		expect(skillsIn('Machine learning and design systems')).toEqual([
			'machine learning',
			'design systems'
		]);
		expect(skillsIn('Gopher, Reactive, Javascripty, Going')).toEqual([]);
	});

	it('lets a sentence’s last full stop go, but keeps dots inside names', () => {
		expect(words('Uses React.')).toBe(' uses react  ');
		expect(skillsIn('Built with .NET.')).toEqual(['.NET']);
	});

	it('lists each skill once', () => {
		expect(new Set(SKILLS.map((skill) => skill.toLowerCase())).size).toBe(SKILLS.length);
	});
});
