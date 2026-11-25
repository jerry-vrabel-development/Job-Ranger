import { describe, expect, it } from 'vitest';
import { dollars } from './money.ts';

describe('dollars', () => {
	it('shows whole cents, rounding halves up', () => {
		expect(dollars(0)).toBe('$0.00');
		expect(dollars(14_100)).toBe('$0.01');
		expect(dollars(45_000)).toBe('$0.05');
		expect(dollars(44_999)).toBe('$0.04');
		expect(dollars(1_250_000)).toBe('$1.25');
	});
});
