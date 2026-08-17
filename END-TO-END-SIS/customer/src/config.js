const env = typeof process !== 'undefined' ? process.env || {} : {};

// Session persistence. The logged-in session (role, tenantId, token, source,
// demo) is the single source of truth for what the app shows.
export const SESSION_KEY = 'e2e-sis-session';
export const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
export const DEFAULT_BACKEND_URL = env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8787';
export const DEFAULT_LIVE_SOURCE = SUPABASE_URL && SUPABASE_ANON_KEY ? 'supabase' : 'backend';
export const DEFAULT_BASE_URL = SUPABASE_URL || DEFAULT_BACKEND_URL;
