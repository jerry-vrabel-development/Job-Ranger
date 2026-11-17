import { env } from 'cloudflare:workers';
import { createHandle } from '#lib/server/handle.ts';

// The logic and its tests are in src/lib/server/handle.ts.
export const handle = createHandle(() => env as unknown as Record<string, unknown>);
