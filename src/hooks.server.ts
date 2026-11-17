import type { Handle } from '@sveltejs/kit';
import { withSecurityHeaders } from '$lib/server/security';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	withSecurityHeaders(response.headers);
	return response;
};
