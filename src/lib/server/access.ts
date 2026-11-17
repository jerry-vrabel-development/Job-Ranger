/**
 * Cloudflare Access, checked in code. Access stops strangers at Cloudflare's
 * edge; this check makes the Worker refuse anything that didn't come through
 * Access for this app, signed in as someone on the allowed list. If any part
 * of the setup is missing, every request is refused (fail closed).
 *
 * https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

/** Where Access puts its signed token. The header, not the cookie: the cookie isn't always sent. */
export const ACCESS_HEADER = 'cf-access-jwt-assertion';

export interface AccessConfig {
	/** e.g. https://example.cloudflareaccess.com (the token's issuer). */
	readonly teamDomain: string;
	/** AUD tags of the Access applications in front of the Worker (workers.dev, previews). */
	readonly auds: readonly string[];
	/** Lowercased emails allowed in. Access policies decide too; this is the second lock. */
	readonly allowedEmails: ReadonlySet<string>;
}

export type AccessResult =
	| { readonly ok: true; readonly email: string }
	| { readonly ok: false; readonly status: 403 | 503; readonly message: string };

const TEAM_DOMAIN = /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/;
const AUD = /^[a-f0-9]{64}$/;

function setting(env: Readonly<Record<string, unknown>>, name: string): string {
	const value = env[name];
	return typeof value === 'string' ? value.trim() : '';
}

/**
 * Reads the Access settings, or null if any is missing or malformed. They are
 * Worker secrets (`wrangler secret put`), so the team and email stay out of
 * the public repository.
 */
export function readAccessConfig(env: Readonly<Record<string, unknown>>): AccessConfig | null {
	const teamDomain = setting(env, 'ACCESS_TEAM_DOMAIN').toLowerCase().replace(/\/+$/, '');
	const auds = setting(env, 'ACCESS_AUD')
		.split(',')
		.map((aud) => aud.trim().toLowerCase())
		.filter(Boolean);
	const allowedEmails = new Set(
		setting(env, 'ACCESS_ALLOWED_EMAILS')
			.split(',')
			.map((email) => email.trim().toLowerCase())
			.filter((email) => email.includes('@'))
	);
	if (
		!TEAM_DOMAIN.test(teamDomain) ||
		auds.length === 0 ||
		!auds.every((aud) => AUD.test(aud)) ||
		allowedEmails.size === 0
	) {
		return null;
	}
	return { teamDomain, auds, allowedEmails };
}

/**
 * True only on a developer's own machine: the ACCESS_LOCAL_DEV flag is set
 * (in .dev.vars or `wrangler dev --var`, never in wrangler.jsonc) and the
 * request is for localhost. Both, or no bypass.
 */
export function isLocalDev(env: Readonly<Record<string, unknown>>, url: URL): boolean {
	return (
		setting(env, 'ACCESS_LOCAL_DEV') === 'true' &&
		(url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
	);
}

const keySets = new Map<string, JWTVerifyGetKey>();

/** Access's signing keys for a team, fetched once per Worker instance and cached by jose. */
export function accessKeys(teamDomain: string): JWTVerifyGetKey {
	let keys = keySets.get(teamDomain);
	if (!keys) {
		keys = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
		keySets.set(teamDomain, keys);
	}
	return keys;
}

const REFUSED = 'Sign in through Cloudflare Access to use Job Ranger.';

/** Checks one request's Access token. Says why it refused in our words, never the token's. */
export async function verifyAccess(
	request: Request,
	config: AccessConfig,
	keys: JWTVerifyGetKey
): Promise<AccessResult> {
	const token = request.headers.get(ACCESS_HEADER);
	if (!token) return { ok: false, status: 403, message: REFUSED };
	let email: unknown;
	try {
		const { payload } = await jwtVerify(token, keys, {
			issuer: config.teamDomain,
			audience: [...config.auds],
			algorithms: ['RS256'],
			requiredClaims: ['exp', 'iat']
		});
		email = payload['email'];
	} catch {
		return { ok: false, status: 403, message: REFUSED };
	}
	if (typeof email !== 'string' || !config.allowedEmails.has(email.toLowerCase())) {
		return { ok: false, status: 403, message: 'This account is not allowed to use Job Ranger.' };
	}
	return { ok: true, email: email.toLowerCase() };
}

/**
 * The whole decision for one request: local dev, missing setup (refuse),
 * or a verified Access token.
 */
export async function checkAccess(
	request: Request,
	env: Readonly<Record<string, unknown>>,
	keysFor: (teamDomain: string) => JWTVerifyGetKey = accessKeys
): Promise<AccessResult> {
	if (isLocalDev(env, new URL(request.url))) return { ok: true, email: 'local-dev' };
	const config = readAccessConfig(env);
	if (!config) {
		return {
			ok: false,
			status: 503,
			message: 'Sign-in is not set up yet, so Job Ranger is closed.'
		};
	}
	return verifyAccess(request, config, keysFor(config.teamDomain));
}

/** The plain-text refusal, never cached. */
export function refusal(result: Extract<AccessResult, { ok: false }>): Response {
	return new Response(result.message, {
		status: result.status,
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
	});
}
