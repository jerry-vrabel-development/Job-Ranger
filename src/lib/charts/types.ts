/** One bar of a bar chart (BarChart.svelte): a named count, with optional words beside it. */
export interface Bar {
	readonly label: string;
	readonly count: number;
	/** Extra words beside the count ("18%", "40% of applied"), or null. */
	readonly detail: string | null;
}
