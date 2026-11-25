/**
 * The 50 states and DC, and how to find them in a posting's location text
 * ("Chicago, IL", "Remote - New York", "Denver, CO or Austin, TX"). Used by the
 * pay signal (design note 0005) and the map of open jobs (design note 0007),
 * so both read a location the same way.
 */

export interface UsState {
	/** Postal code, as locations write it ("Chicago, IL"). */
	readonly code: string;
	readonly name: string;
	/** The Census FIPS code, which the map's shapes are keyed by. */
	readonly fips: string;
}

export const US_STATES: readonly UsState[] = [
	{ code: 'AL', name: 'Alabama', fips: '01' },
	{ code: 'AK', name: 'Alaska', fips: '02' },
	{ code: 'AZ', name: 'Arizona', fips: '04' },
	{ code: 'AR', name: 'Arkansas', fips: '05' },
	{ code: 'CA', name: 'California', fips: '06' },
	{ code: 'CO', name: 'Colorado', fips: '08' },
	{ code: 'CT', name: 'Connecticut', fips: '09' },
	{ code: 'DE', name: 'Delaware', fips: '10' },
	{ code: 'DC', name: 'District of Columbia', fips: '11' },
	{ code: 'FL', name: 'Florida', fips: '12' },
	{ code: 'GA', name: 'Georgia', fips: '13' },
	{ code: 'HI', name: 'Hawaii', fips: '15' },
	{ code: 'ID', name: 'Idaho', fips: '16' },
	{ code: 'IL', name: 'Illinois', fips: '17' },
	{ code: 'IN', name: 'Indiana', fips: '18' },
	{ code: 'IA', name: 'Iowa', fips: '19' },
	{ code: 'KS', name: 'Kansas', fips: '20' },
	{ code: 'KY', name: 'Kentucky', fips: '21' },
	{ code: 'LA', name: 'Louisiana', fips: '22' },
	{ code: 'ME', name: 'Maine', fips: '23' },
	{ code: 'MD', name: 'Maryland', fips: '24' },
	{ code: 'MA', name: 'Massachusetts', fips: '25' },
	{ code: 'MI', name: 'Michigan', fips: '26' },
	{ code: 'MN', name: 'Minnesota', fips: '27' },
	{ code: 'MS', name: 'Mississippi', fips: '28' },
	{ code: 'MO', name: 'Missouri', fips: '29' },
	{ code: 'MT', name: 'Montana', fips: '30' },
	{ code: 'NE', name: 'Nebraska', fips: '31' },
	{ code: 'NV', name: 'Nevada', fips: '32' },
	{ code: 'NH', name: 'New Hampshire', fips: '33' },
	{ code: 'NJ', name: 'New Jersey', fips: '34' },
	{ code: 'NM', name: 'New Mexico', fips: '35' },
	{ code: 'NY', name: 'New York', fips: '36' },
	{ code: 'NC', name: 'North Carolina', fips: '37' },
	{ code: 'ND', name: 'North Dakota', fips: '38' },
	{ code: 'OH', name: 'Ohio', fips: '39' },
	{ code: 'OK', name: 'Oklahoma', fips: '40' },
	{ code: 'OR', name: 'Oregon', fips: '41' },
	{ code: 'PA', name: 'Pennsylvania', fips: '42' },
	{ code: 'RI', name: 'Rhode Island', fips: '44' },
	{ code: 'SC', name: 'South Carolina', fips: '45' },
	{ code: 'SD', name: 'South Dakota', fips: '46' },
	{ code: 'TN', name: 'Tennessee', fips: '47' },
	{ code: 'TX', name: 'Texas', fips: '48' },
	{ code: 'UT', name: 'Utah', fips: '49' },
	{ code: 'VT', name: 'Vermont', fips: '50' },
	{ code: 'VA', name: 'Virginia', fips: '51' },
	{ code: 'WA', name: 'Washington', fips: '53' },
	{ code: 'WV', name: 'West Virginia', fips: '54' },
	{ code: 'WI', name: 'Wisconsin', fips: '55' },
	{ code: 'WY', name: 'Wyoming', fips: '56' }
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// DC first, so "Washington, DC" is never read as Washington state.
const DC = /\bD\.\s?C\.?(?![a-z])|,\s*DC\b|\bDistrict of Columbia\b|\bWashington\s+DC\b/i;

/** Whether one segment of a location names a state. */
export function namesState(segment: string, state: Pick<UsState, 'code' | 'name'>): boolean {
	if (state.code === 'DC') return DC.test(segment);
	if (state.code === 'WA' && DC.test(segment)) return false;
	// "Chicago, IL", "Austin, TX, US": the code after a comma, in capitals.
	if (new RegExp(`,\\s*${state.code}(?![A-Za-z])`).test(segment)) return true;
	// The full name, but not inside another ("West Virginia" isn't Virginia;
	// "Kansas" isn't found in "Arkansas").
	const name = state.code === 'VA' ? '(?<!West\\s)Virginia' : escape(state.name);
	return new RegExp(`(?<![A-Za-z])${name}(?![A-Za-z])`, 'i').test(segment);
}

/** A location split where it lists several places ("A; B", "A / B", "A or B"). */
export function segmentsOf(location: string): string[] {
	return location.split(/[;|/]|\s+or\s+/i);
}

/** The states a location names, in the list's order, each once. */
export function statesIn(location: string): UsState[] {
	const segments = segmentsOf(location);
	return US_STATES.filter((state) => segments.some((segment) => namesState(segment, state)));
}
