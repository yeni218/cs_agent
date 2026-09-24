// Session persistence + Supabase connection.
// Bare React Native (no Expo build-time env inlining), so the public Supabase
// URL and anon key are set here directly. The anon key is designed to be public
// (row-level security enforces access); it is NOT a secret.
export const SESSION_KEY = 'e2e-sis-session';
export const SUPABASE_URL = 'https://tdmfpiynrybrnehnoaot.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkbWZwaXlucnlicm5laG5vYW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5ODk4NDcsImV4cCI6MjEwMjU2NTg0N30.qCArAQdUOm14UHPXA-h-39V4UsglbRNpQ3joE7I_hMk';
