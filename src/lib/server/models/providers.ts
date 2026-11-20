/** The model providers Job Ranger can draft with. Add an adapter here to offer another. */
import { ANTHROPIC } from './anthropic.ts';
import type { ProviderInfo } from './model.ts';

export const PROVIDERS: Readonly<Record<string, ProviderInfo>> = { anthropic: ANTHROPIC };
