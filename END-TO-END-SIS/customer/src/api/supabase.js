import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config.js';

const cache = new Map();

export function getSupabaseConfig({ url, anonKey } = {}) {
  return {
    url: (url || SUPABASE_URL || '').replace(/\/$/, ''),
    anonKey: anonKey || SUPABASE_ANON_KEY || ''
  };
}

export function hasSupabaseConfig(overrides = {}) {
  const cfg = getSupabaseConfig(overrides);
  return Boolean(cfg.url && cfg.anonKey);
}

export function getSupabaseClient(overrides = {}) {
  const cfg = getSupabaseConfig(overrides);
  if (!cfg.url || !cfg.anonKey) {
    throw new Error('Supabase URL ve anon key gerekli. EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_ANON_KEY ayarlayın.');
  }

  const key = `${cfg.url}|${cfg.anonKey}`;
  if (!cache.has(key)) {
    cache.set(key, createClient(cfg.url, cfg.anonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
      }
    }));
  }
  return cache.get(key);
}

export async function requireData(result) {
  const { data, error } = await result;
  if (error) throw new Error(error.message);
  return data;
}
