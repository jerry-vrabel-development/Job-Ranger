import type { Handle } from '@sveltejs/kit/hooks';
import { checkAccess, refusal } from './access.ts';
import { withSecurityHeaders } from './security.ts';

/**
 * The server hook: every page and form goes through Cloudflare Access,
 * checked here as well as at the edge, and every response gets the security
 * headers. Nothing is public by default: a new route is private without
 * anyone having to remember.
 */
export function createHandle(getEnv: () => Readonly<Record<string, unknown>>): Handle {
	return async ({ event, resolve }) => {
		const access = await checkAccess(event.request, getEnv());
		const response = access.ok ? await resolve(event) : refusal(access);
		withSecurityHeaders(response.headers);
		return response;
	};
}
