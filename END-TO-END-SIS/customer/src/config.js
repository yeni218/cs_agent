// Session persistence. The logged-in session (role, tenantId, token, source)
// is the single source of truth for what the app shows.
export const SESSION_KEY = 'e2e-sis-session';

// NOTE: reference process.env.EXPO_PUBLIC_* DIRECTLY (no aliasing). Expo inlines
// these at build time by statically replacing the literal `process.env.EXPO_PUBLIC_X`
// text — accessing them through an aliased object leaves them undefined in the bundle.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
