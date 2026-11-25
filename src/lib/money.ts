/**
 * "$0.04", from millionths of a dollar (how drafting costs are stored).
 * Rounded to whole cents first: toFixed alone works on the binary
 * approximation, so $0.045 would show as $0.04.
 */
export function dollars(micros: number): string {
	return `$${(Math.round(micros / 10_000) / 100).toFixed(2)}`;
}
