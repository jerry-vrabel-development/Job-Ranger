/**
 * My name and contact details, for the resume header (design note 0004).
 * Code puts them on the page; they are never sent to a model.
 */
import { text } from './db.ts';

export interface Profile {
	readonly name: string;
	readonly headline: string;
	readonly email: string;
	readonly phone: string;
	readonly location: string;
}

export type ProfileField = keyof Profile;

export const PROFILE_MAX: Readonly<Record<ProfileField, number>> = {
	name: 100,
	headline: 150,
	email: 200,
	phone: 40,
	location: 100
};

const LABELS: Readonly<Record<ProfileField, string>> = {
	name: 'your name',
	headline: 'the headline',
	email: 'the email',
	phone: 'the phone number',
	location: 'the location'
};

export const EMPTY_PROFILE: Profile = {
	name: '',
	headline: '',
	email: '',
	phone: '',
	location: ''
};

export type CheckedProfile =
	| { readonly ok: true; readonly profile: Profile }
	| { readonly ok: false; readonly field: ProfileField; readonly message: string };

export function checkProfile(values: Record<ProfileField, string>): CheckedProfile {
	const tidy = (value: string) => value.trim().replace(/\s+/g, ' ');
	const profile: Profile = {
		name: tidy(values.name),
		headline: tidy(values.headline),
		email: tidy(values.email),
		phone: tidy(values.phone),
		location: tidy(values.location)
	};
	for (const field of Object.keys(PROFILE_MAX) as ProfileField[]) {
		if (profile[field].length > PROFILE_MAX[field]) {
			return {
				ok: false,
				field,
				message: `Keep ${LABELS[field]} under ${String(PROFILE_MAX[field])} characters.`
			};
		}
	}
	if (profile.email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
		return { ok: false, field: 'email', message: 'That email address doesn’t look complete.' };
	}
	return { ok: true, profile };
}

export async function getProfile(db: D1Database): Promise<Profile> {
	const row = await db.prepare('SELECT * FROM profile WHERE id = 1').first();
	if (row === null) return EMPTY_PROFILE;
	return {
		name: text(row, 'name'),
		headline: text(row, 'headline'),
		email: text(row, 'email'),
		phone: text(row, 'phone'),
		location: text(row, 'location')
	};
}

export async function saveProfile(
	db: D1Database,
	profile: Profile
): Promise<{ ok: true; message: string }> {
	await db
		.prepare(
			`INSERT INTO profile (id, name, headline, email, phone, location) VALUES (1, ?1, ?2, ?3, ?4, ?5)
			 ON CONFLICT (id) DO UPDATE SET name = excluded.name, headline = excluded.headline,
			 email = excluded.email, phone = excluded.phone, location = excluded.location,
			 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
		)
		.bind(profile.name, profile.headline, profile.email, profile.phone, profile.location)
		.run();
	return { ok: true, message: 'Saved your details.' };
}
