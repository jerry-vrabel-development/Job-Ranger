import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A form control set from data with value= or checked= is set again when the
// page's script starts, which wipes anything chosen or typed before it loaded.
// Controls start from defaults instead: selected on options, defaultChecked,
// and defaultValue (or `value={browser ? undefined : …}` beside it).

const ROOT = join(import.meta.dirname, '..');

/** Every .svelte file under src, as [path, text]. */
function svelteFiles(): [string, string][] {
	return readdirSync(ROOT, { recursive: true, encoding: 'utf8' })
		.filter((path) => path.endsWith('.svelte'))
		.map((path) => [path, readFileSync(join(ROOT, path), 'utf8')]);
}

/** The opening tags of every input, select and textarea, across lines. */
function controls(text: string): string[] {
	return [...text.matchAll(/<(input|select|textarea)\b(?:[^>{]|\{[^}]*\})*>/g)].map(
		(match) => match[0]
	);
}

/** Controls whose value is only what they submit, never what's shown as chosen. */
const SUBMIT_ONLY = /\btype="(hidden|checkbox|radio|submit|button)"/;

/** What's wrong with one opening tag, or undefined if it's fine. */
function problem(tag: string): string | undefined {
	if (/\schecked=\{/.test(tag)) return 'checked= (use defaultChecked)';
	if (tag.startsWith('<select') && /\svalue=\{/.test(tag)) {
		return 'value= on a select (use selected on each option)';
	}
	const value = /\svalue=\{\s*([^}]*)\}/.exec(tag);
	if (value?.[1] === undefined || SUBMIT_ONLY.test(tag)) return undefined;
	if (value[1].replace(/\s+/g, ' ').startsWith('browser ? undefined')) return undefined;
	return 'value= (use defaultValue)';
}

describe('problem', () => {
	it('flags controls set with values', () => {
		expect(problem('<input type="checkbox" name="x" checked={on} />')).toMatch(/defaultChecked/);
		expect(problem('<select id="s" name="s" value={chosen}>')).toMatch(/selected/);
		expect(problem('<input id="q" name="q" type="search" value={q} />')).toMatch(/defaultValue/);
		expect(problem('<textarea name="t" value={text}>')).toMatch(/defaultValue/);
	});

	it('allows defaults, submit-only values and the browser guard', () => {
		expect(problem('<input type="checkbox" value={level} defaultChecked={on} />')).toBeUndefined();
		expect(problem('<input type="hidden" name="id" value={id} />')).toBeUndefined();
		expect(problem('<input name="q" defaultValue={q} />')).toBeUndefined();
		expect(problem('<textarea value={browser ? undefined : text} defaultValue={text}>')).toBe(
			undefined
		);
		expect(problem('<select id="s" name="s">')).toBeUndefined();
	});

	it('reads the browser guard when it spans lines', () => {
		expect(problem('<textarea value={browser\n\t? undefined\n\t: text} defaultValue={text}>')).toBe(
			undefined
		);
	});

	it('reads a tag that spans lines and holds a braced expression', () => {
		const tag = controls('<input\n\ttype="text"\n\tvalue={a > b ? x : y}\n/>');
		expect(tag).toHaveLength(1);
		expect(problem(tag[0] ?? '')).toMatch(/defaultValue/);
	});
});

describe('every form control in the app', () => {
	it('starts from defaults, so nothing chosen before the script loads is wiped', () => {
		const found = svelteFiles().flatMap(([path, text]) =>
			controls(text).flatMap((tag) => {
				const what = problem(tag);
				return what === undefined ? [] : [`${path}: ${what}\n${tag}`];
			})
		);
		expect(found).toEqual([]);
	});

	it('finds the controls it checks', () => {
		// Guards against the scan quietly matching nothing.
		const count = svelteFiles().reduce((sum, [, text]) => sum + controls(text).length, 0);
		expect(count).toBeGreaterThan(50);
	});
});
