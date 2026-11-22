/**
 * US states (and DC) whose laws require a pay range in job postings, for the
 * missing-pay signal (design note 0005, part 2). Each entry was checked
 * against the state's own site, or its legislature's, on the date below.
 * Laws change: re-check before relying on it, and update the date.
 *
 * Only postings laws are here. States that require pay only on request or
 * after an interview (Nevada, Rhode Island) aren't, since a posting without
 * pay doesn't break them.
 */

/** When every entry below was last checked against its source. */
export const PAY_LAWS_CHECKED = '2026-11-22';

export interface PayLaw {
	/** Postal code, as locations write it ("Chicago, IL"). */
	readonly code: string;
	readonly name: string;
	/** Smallest employer the posting rule covers, by headcount. 1 means any employer. */
	readonly minEmployees: number;
	/** The day the posting rule took (or takes) effect, YYYY-MM-DD. */
	readonly effective: string;
	/** The state's own page on the rule. */
	readonly url: string;
}

export const PAY_LAWS: readonly PayLaw[] = [
	{
		code: 'CA',
		name: 'California',
		minEmployees: 15,
		effective: '2023-01-01',
		url: 'https://www.dir.ca.gov/dlse/california_equal_pay_act.htm'
	},
	{
		code: 'CO',
		name: 'Colorado',
		minEmployees: 1,
		effective: '2021-01-01',
		url: 'https://cdle.colorado.gov/sites/cdle/files/INFO%20%239A%20Transparency%20in%20Pay%20and%20Job%20Opportunities%20The%20Colorado%20EPEWA%20Part%202%205.29.24%20%5Baccessible%5D.pdf'
	},
	{
		code: 'CT',
		name: 'Connecticut',
		minEmployees: 1,
		effective: '2026-10-01',
		url: 'https://portal.ct.gov/governor/news/press-releases/2026/05-2026/governor-lamont-signs-legislation-protecting-workers-rights'
	},
	{
		code: 'DC',
		name: 'Washington, D.C.',
		minEmployees: 1,
		effective: '2024-06-30',
		url: 'https://oag.dc.gov/worker-rights/wage-and-hour-laws'
	},
	{
		// Signed Sept. 26, 2025; takes effect two years later.
		code: 'DE',
		name: 'Delaware',
		minEmployees: 26,
		effective: '2027-09-26',
		url: 'https://news.delaware.gov/2025/09/29/governor-matt-meyer-signs-house-bills-on-pay-transparency-unlicensed-bodywork-establishments/'
	},
	{
		code: 'HI',
		name: 'Hawaii',
		minEmployees: 50,
		effective: '2024-01-01',
		url: 'https://labor.hawaii.gov/hcrc/files/2023/11/Act-203-Pay-Transparency-FAQs.pdf'
	},
	{
		code: 'IL',
		name: 'Illinois',
		minEmployees: 15,
		effective: '2025-01-01',
		url: 'https://labor.illinois.gov/laws-rules/conmed/equal-pay-act-salary-transparency.html'
	},
	{
		code: 'ME',
		name: 'Maine',
		minEmployees: 10,
		effective: '2026-07-29',
		url: 'https://www.maine.gov/labor/news_events/article.shtml?id=13356290'
	},
	{
		code: 'MD',
		name: 'Maryland',
		minEmployees: 1,
		effective: '2024-10-01',
		url: 'https://labor.maryland.gov/labor/wages/esswagerangefaq.shtml'
	},
	{
		code: 'MA',
		name: 'Massachusetts',
		minEmployees: 25,
		effective: '2025-10-29',
		url: 'https://www.mass.gov/info-details/pay-transparency-in-massachusetts'
	},
	{
		code: 'MN',
		name: 'Minnesota',
		minEmployees: 30,
		effective: '2025-01-01',
		url: 'https://www.revisor.mn.gov/statutes/cite/181.173'
	},
	{
		code: 'NJ',
		name: 'New Jersey',
		minEmployees: 10,
		effective: '2025-06-01',
		url: 'https://www.nj.gov/labor/myworkrights/wages/pay-transparency/'
	},
	{
		code: 'NY',
		name: 'New York',
		minEmployees: 4,
		effective: '2023-09-17',
		url: 'https://dol.ny.gov/pay-transparency'
	},
	{
		code: 'VT',
		name: 'Vermont',
		minEmployees: 5,
		effective: '2025-07-01',
		url: 'https://ago.vermont.gov/attorney-generals-office-divisions-and-units/civil-rights/employment-law'
	},
	{
		code: 'VA',
		name: 'Virginia',
		minEmployees: 1,
		effective: '2026-07-01',
		url: 'https://doli.virginia.gov/2026/07/01/employment-law-updates-new-legislation-protecting-virginia-workers-applies-beginning-july-1-2026/'
	},
	{
		code: 'WA',
		name: 'Washington',
		minEmployees: 15,
		effective: '2023-01-01',
		url: 'https://www.lni.wa.gov/workers-rights/wages/equal-pay-opportunities-act/'
	}
];
