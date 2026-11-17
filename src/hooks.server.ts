import type { Handle } from '@sveltejs/kit/hooks';
import { withSecurityHeaders } from '#lib/server/security.ts';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	withSecurityHeaders(response.headers);
	return response;
};
