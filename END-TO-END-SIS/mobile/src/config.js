// Central config. The whole point of this app is that the API is SWAPPABLE:
// today it points at Vapi; later we point baseUrl at our own sovereign backend
// that exposes the same Vapi-shaped endpoints (/assistant, /call).
export const PRESETS = {
  demo: { label: 'Demo (no key)', baseUrl: '' },
  vapi: { label: 'Vapi Cloud', baseUrl: 'https://api.vapi.ai' },
  local: { label: 'Afiyet Backend', baseUrl: 'http://localhost:8787' }
};

export const DEFAULT_CONFIG = {
  preset: 'demo',
  baseUrl: PRESETS.demo.baseUrl,
  apiKey: '',
  demo: true
};

export const STORAGE_KEY = 'e2e-sis-config';
