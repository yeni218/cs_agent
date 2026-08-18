import { getSupabaseClient } from './supabase.js';

// The app talks directly to Supabase. Supabase IS the backend: auth, tenancy,
// RLS-enforced customer cost redaction, and the call store all live there.
export class ApiClient {
  constructor({ session = null } = {}) {
    this.session = session;
    this.source = 'supabase';
    this.supabase = getSupabaseClient({ url: session?.supabaseUrl });
  }

  async signOut() {
    if (this.supabase) await this.supabase.auth.signOut();
  }
}
