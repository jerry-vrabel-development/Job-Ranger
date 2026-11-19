import { describe, expect, it } from 'vitest';
import {
	normalize,
	normalizeSql,
	SEPARATORS,
	whyMatched,
	type InterestMatch
} from './interest-match.ts';

const robotics: InterestMatch = {
	id: 1,
	name: 'Robotics',
	keywords: ['robot', 'ros', 'c++', 'machine learning'],
	boards: ['greenhouse:flyzipline']
};

const job = (title: string, department: string | null = null, board = 'other') => ({
	source: 'ashby',
	board,
	title,
	department
});

describe('normalize', () => {
	it('lowercases A–Z, turns separators into spaces, and pads both ends', () => {
		expect(normalize('Engineer, Robot/Arm (ROS)')).toBe(' engineer  robot arm  ros  ');
		expect(normalize('Lead – Robot — Ops')).toBe(' lead   robot   ops ');
	});

	it('keeps the characters keywords may hold', () => {
		expect(normalize("C++ & C# .NET R&D full-stack O'Neil")).toBe(
			" c++ & c# .net r&d full-stack o'neil "
		);
	});

	it('leaves letters outside A–Z alone, as SQLite does', () => {
		expect(normalize('ÉTÉ')).toBe(' ÉtÉ ');
	});

	it('builds SQL that replaces each separator by its code point', () => {
		const sql = normalizeSql('p.title');
		expect(sql.startsWith("(' ' || replace(")).toBe(true);
		expect(sql).toContain('lower(p.title)');
		for (const code of SEPARATORS) expect(sql).toContain(`char(${String(code)})`);
	});
});

describe('whyMatched', () => {
	it('names a company tag first', () => {
		expect(whyMatched(robotics, job('Accountant', null, 'flyzipline'))).toBeNull();
		expect(
			whyMatched(robotics, { ...job('Accountant', null, 'flyzipline'), source: 'greenhouse' })
		).toBe('Robotics: company tag');
	});

	it('names the keyword and where it was found', () => {
		expect(whyMatched(robotics, job('Senior Robot Engineer'))).toBe('Robotics: title has “robot”');
		expect(whyMatched(robotics, job('Engineer', 'Autonomy · ROS'))).toBe(
			'Robotics: team has “ros”'
		);
		expect(whyMatched(robotics, job('C++ Developer'))).toBe('Robotics: title has “c++”');
		expect(whyMatched(robotics, job('Engineer, Machine Learning'))).toBe(
			'Robotics: title has “machine learning”'
		);
	});

	it('matches whole words only', () => {
		for (const title of [
			'Microsoft Across Teams',
			'Robotics Lead',
			'Roster Manager',
			'C Developer'
		]) {
			expect(whyMatched(robotics, job(title, 'Robotic Process'))).toBeNull();
		}
	});
});
