import {
	createLocalJWKSet,
	exportJWK,
	generateKeyPair,
	SignJWT,
	type CryptoKey,
	type JWTVerifyGetKey
} from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import {
	ACCESS_HEADER,
	accessKeys,
	checkAccess,
	isLocalDev,
	readAccessConfig,
	refusal,
	verifyAccess,
	type AccessConfig
} from './access.ts';

const TEAM = 'https://example-team.cloudflareaccess.com';
const AUD = 'a'.repeat(64);
const ME = 'jerry@example.com';

const env = {
	ACCESS_TEAM_DOMAIN: TEAM,
	ACCESS_AUD: AUD,
	ACCESS_ALLOWED_EMAILS: ME
};

let keys: JWTVerifyGetKey;
let signingKey: CryptoKey;
let strangerKey: CryptoKey;

beforeAll(async () => {
	const pair = await generateKeyPair('RS256');
	signingKey = pair.privateKey;
	strangerKey = (await generateKeyPair('RS256')).privateKey;
	keys = createLocalJWKSet({
		keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' }]
	});
});

/** A token like the one Access sends, with any claim changed for the test. */
async function token(
	claims: Record<string, unknown> = {},
	options: { key?: CryptoKey; issuer?: string; audience?: string; expires?: string } = {}
) {
	return new SignJWT({ email: ME, ...claims })
		.setProtectedHeader({ alg: 'RS256', kid: 'k1' })
		.setIssuer(options.issuer ?? TEAM)
		.setAudience(options.audience ?? AUD)
		.setIssuedAt()
		.setExpirationTime(options.expires ?? '5m')
		.sign(options.key ?? signingKey);
}

function request(jwt?: string, url = 'https://job-ranger.example.workers.dev/jobs'): Request {
	return new Request(url, { headers: jwt ? { [ACCESS_HEADER]: jwt } : {} });
}

/** The config, or a clear failure if the test's own settings are wrong. */
function configFrom(settings: Record<string, unknown>): AccessConfig {
	const read = readAccessConfig(settings);
	if (!read) throw new Error('test settings are not a valid Access config');
	return read;
}

const config = configFrom(env);

describe('readAccessConfig', () => {
	it('reads and normalises the three settings', () => {
		expect(
			readAccessConfig({
				ACCESS_TEAM_DOMAIN: ' https://Example-Team.cloudflareaccess.com/ ',
				ACCESS_AUD: AUD.toUpperCase(),
				ACCESS_ALLOWED_EMAILS: ' Jerry@Example.com , other@example.com,, nonsense '
			})
		).toEqual({
			teamDomain: TEAM,
			auds: [AUD],
			allowedEmails: new Set(['jerry@example.com', 'other@example.com'])
		});
	});

	it('is null when anything is missing or malformed, so the app stays closed', () => {
		for (const broken of [
			{},
			{ ...env, ACCESS_TEAM_DOMAIN: '' },
			{ ...env, ACCESS_TEAM_DOMAIN: 'http://example-team.cloudflareaccess.com' },
			{ ...env, ACCESS_TEAM_DOMAIN: 'https://evil.example.com' },
			{ ...env, ACCESS_TEAM_DOMAIN: 'https://x.cloudflareaccess.com.evil.example' },
			{ ...env, ACCESS_AUD: 'short' },
			{ ...env, ACCESS_AUD: `${AUD},short` },
			{ ...env, ACCESS_AUD: ' , ' },
			{ ...env, ACCESS_AUD: 42 },
			{ ...env, ACCESS_ALLOWED_EMAILS: '' },
			{ ...env, ACCESS_ALLOWED_EMAILS: 'not-an-email' }
		]) {
			expect(readAccessConfig(broken)).toBeNull();
		}
	});
});

describe('isLocalDev', () => {
	const local = new URL('http://localhost:4173/jobs');

	it('needs both the flag and a localhost address', () => {
		expect(isLocalDev({ ACCESS_LOCAL_DEV: 'true' }, local)).toBe(true);
		expect(isLocalDev({ ACCESS_LOCAL_DEV: 'true' }, new URL('http://127.0.0.1:4173/'))).toBe(true);
		expect(isLocalDev({ ACCESS_LOCAL_DEV: 'true' }, new URL('http://[::1]:4173/'))).toBe(true);
		expect(isLocalDev({}, local)).toBe(false);
		expect(isLocalDev({ ACCESS_LOCAL_DEV: '1' }, local)).toBe(false);
		expect(
			isLocalDev({ ACCESS_LOCAL_DEV: 'true' }, new URL('https://job-ranger.example.workers.dev/'))
		).toBe(false);
		expect(
			isLocalDev({ ACCESS_LOCAL_DEV: 'true' }, new URL('http://localhost.evil.example/'))
		).toBe(false);
	});
});

describe('verifyAccess', () => {
	it('lets in an allowed person with a valid Access token', async () => {
		expect(await verifyAccess(request(await token()), config, keys)).toEqual({
			ok: true,
			email: ME
		});
	});

	it('accepts a token for any of the configured Access apps, and only those', async () => {
		const both = configFrom({ ...env, ACCESS_AUD: `${AUD}, ${'c'.repeat(64)}` });
		expect(both.auds).toEqual([AUD, 'c'.repeat(64)]);
		const preview = await token({}, { audience: 'c'.repeat(64) });
		expect((await verifyAccess(request(preview), both, keys)).ok).toBe(true);
		expect((await verifyAccess(request(preview), config, keys)).ok).toBe(false);
	});

	it('matches the email whatever its case', async () => {
		const result = await verifyAccess(
			request(await token({ email: 'JERRY@Example.com' })),
			config,
			keys
		);
		expect(result).toEqual({ ok: true, email: ME });
	});

	it('refuses a request with no token', async () => {
		expect(await verifyAccess(request(), config, keys)).toMatchObject({ ok: false, status: 403 });
	});

	const bad: [string, () => Promise<string>][] = [
		['signed with another key', () => token({}, { key: strangerKey })],
		['from another team', () => token({}, { issuer: 'https://other.cloudflareaccess.com' })],
		['for another Access app', () => token({}, { audience: 'b'.repeat(64) })],
		['expired', () => token({}, { expires: '1s ago' })]
	];

	it.each(bad)('refuses a token %s', async (_name, make) => {
		const result = await verifyAccess(request(await make()), config, keys);
		expect(result).toEqual({
			ok: false,
			status: 403,
			message: 'Sign in through Cloudflare Access to use Job Ranger.'
		});
	});

	it('refuses garbage, and a token with the signature stripped', async () => {
		expect((await verifyAccess(request('not.a.token'), config, keys)).ok).toBe(false);
		const [header, body] = (await token()).split('.');
		const unsigned = `${header ?? ''}.${body ?? ''}.`;
		expect((await verifyAccess(request(unsigned), config, keys)).ok).toBe(false);
	});

	it('refuses someone Access let in who is not on the list', async () => {
		for (const email of ['someone@example.com', undefined, 7]) {
			const result = await verifyAccess(request(await token({ email })), config, keys);
			expect(result).toEqual({
				ok: false,
				status: 403,
				message: 'This account is not allowed to use Job Ranger.'
			});
		}
	});
});

describe('checkAccess', () => {
	it('is closed when sign-in is not set up', async () => {
		expect(await checkAccess(request(await token()), {}, () => keys)).toEqual({
			ok: false,
			status: 503,
			message: 'Sign-in is not set up yet, so Job Ranger is closed.'
		});
	});

	it('verifies against the configured team', async () => {
		const asked: string[] = [];
		const result = await checkAccess(request(await token()), env, (team) => {
			asked.push(team);
			return keys;
		});
		expect(result.ok).toBe(true);
		expect(asked).toEqual([TEAM]);
	});

	it('lets local development in without a token, and only there', async () => {
		const devEnv = { ACCESS_LOCAL_DEV: 'true' };
		expect(await checkAccess(request(undefined, 'http://localhost:5173/jobs'), devEnv)).toEqual({
			ok: true,
			email: 'local-dev'
		});
		expect((await checkAccess(request(), devEnv)).ok).toBe(false);
	});
});

describe('accessKeys', () => {
	it('uses one key set per team, from its certs address', () => {
		const first = accessKeys(TEAM);
		expect(accessKeys(TEAM)).toBe(first);
		expect(accessKeys('https://other.cloudflareaccess.com')).not.toBe(first);
	});
});

describe('refusal', () => {
	it('is plain text, never cached', async () => {
		const response = refusal({ ok: false, status: 403, message: 'No.' });
		expect(response.status).toBe(403);
		expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.text()).toBe('No.');
	});
});
