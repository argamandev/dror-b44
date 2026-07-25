// The ONLY file importing the SDK client factory.
// appId is baked in from base44/.app.jsonc — it's a public identifier, not a secret,
// and the scaffold hardcodes it the same way (no env var indirection needed).
import { createClient } from '@base44/sdk';

export const base44 = createClient({ appId: '6a649a6401a472806f3cb1e4' });
