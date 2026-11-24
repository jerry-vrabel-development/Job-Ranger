import { describe, expect, it } from 'vitest';
import { lineGeometry, nearestIndex, type Box } from './line.ts';

const box: Box = { width: 110, height: 70, top: 10, right: 10, bottom: 10, left: 0 };

describe('line geometry', () => {
	it('spreads the days across the width, with the y axis from 0', () => {
		const g = lineGeometry(
			[
				{ day: '2026-11-22', count: 0 },
				{ day: '2026-11-23', count: 5 },
				{ day: '2026-11-24', count: 10 }
			],
			box
		);
		expect(g.xs).toEqual([0, 50, 100]);
		// 0 at the bottom (y 60), 10 at the top (y 10).
		expect(g.ys).toEqual([60, 35, 10]);
		expect(g.path).toBe('M0,60L50,35L100,10');
		expect(g.ticks.map((t) => t.value)).toEqual([0, 5, 10]);
		expect(g.end).toEqual({ index: 2, x: 100, y: 10 });
	});

	it('breaks the line at a gap, and ends at the last day with a count', () => {
		const g = lineGeometry(
			[
				{ day: '2026-11-21', count: 4 },
				{ day: '2026-11-22', count: 4 },
				{ day: '2026-11-23', count: null },
				{ day: '2026-11-24', count: null }
			],
			box
		);
		expect(g.ys.slice(2)).toEqual([null, null]);
		expect(g.path.match(/M/g)).toHaveLength(1);
		expect(g.end?.index).toBe(1);
	});

	it('draws nothing, without failing, when there are no counts', () => {
		const g = lineGeometry([], box);
		expect(g).toMatchObject({ path: '', xs: [], ys: [], end: null });
		expect(lineGeometry([{ day: '2026-11-24', count: null }], box).end).toBeNull();
	});
});

describe('the nearest day to the pointer', () => {
	it('snaps to the closest x', () => {
		expect(nearestIndex([0, 50, 100], 20)).toBe(0);
		expect(nearestIndex([0, 50, 100], 30)).toBe(1);
		expect(nearestIndex([0, 50, 100], 500)).toBe(2);
		expect(nearestIndex([], 10)).toBe(0);
	});
});
