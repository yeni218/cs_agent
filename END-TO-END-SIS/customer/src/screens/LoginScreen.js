import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView } from 'react-native';
import { login, DEMO_HINTS } from '../api/auth.js';
import { DEFAULT_LIVE_SOURCE } from '../config.js';
import { theme } from '../components/ui.js';

// Single login. Same screen for restaurants and for us — the account decides
// which app you get.
export default function LoginScreen({ defaultBaseUrl, onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [useDemo, setUseDemo] = useState(true);
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl || 'http://localhost:8787');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const liveUrlLabel = DEFAULT_LIVE_SOURCE === 'supabase' ? 'Supabase URL' : 'Backend URL';
  const liveUrlPlaceholder = DEFAULT_LIVE_SOURCE === 'supabase' ? 'https://project.supabase.co' : 'http://localhost:8787';

  const submit = async (creds) => {
    const e = creds?.email ?? email;
    const p = creds?.password ?? password;
    setBusy(true);
    setError(null);
    try {
      const session = await login({ baseUrl, email: e, password: p, demo: useDemo });
      onLogin(session);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.root} keyboardShouldPersistTaps="handled">
      <Text style={styles.brand}>Afiyet<Text style={{ color: theme.accent }}>Sesli</Text></Text>
      <Text style={styles.tagline}>Sesli sipariş asistanı platformu</Text>

      <View style={styles.card}>
        <Text style={styles.label}>E-posta</Text>
        <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none"
          autoCorrect={false} keyboardType="email-address" placeholder="ornek@restoran.com" placeholderTextColor={theme.muted} />
        <Text style={styles.label}>Şifre</Text>
        <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry
          placeholder="••••••" placeholderTextColor={theme.muted} />

        <TouchableOpacity style={styles.toggle} onPress={() => setUseDemo((v) => !v)}>
          <View style={[styles.checkbox, useDemo && styles.checkboxOn]} />
          <Text style={styles.toggleText}>Demo modu (backend gerektirmez)</Text>
        </TouchableOpacity>

        {!useDemo && (
          <>
            <Text style={styles.label}>{liveUrlLabel}</Text>
            <TextInput style={styles.input} value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none"
              autoCorrect={false} placeholder={liveUrlPlaceholder} placeholderTextColor={theme.muted} />
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={styles.button} onPress={() => submit()} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Giriş Yap</Text>}
        </TouchableOpacity>
      </View>

      {useDemo && (
        <View style={styles.hints}>
          <Text style={styles.hintTitle}>Hızlı demo girişi</Text>
          {DEMO_HINTS.map((h) => (
            <TouchableOpacity key={h.email} style={styles.hint} onPress={() => submit(h)} disabled={busy}>
              <Text style={styles.hintText}>{h.label}</Text>
              <Text style={styles.hintSub}>{h.email}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, backgroundColor: theme.bg, padding: 24, justifyContent: 'center' },
  brand: { color: theme.text, fontSize: 30, fontWeight: '900', textAlign: 'center' },
  tagline: { color: theme.muted, textAlign: 'center', marginTop: 4, marginBottom: 24 },
  card: { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 18, padding: 20 },
  label: { color: theme.muted, fontSize: 12, marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: '#fff', borderColor: theme.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: theme.text },
  toggle: { flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 8 },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 2, borderColor: theme.muted },
  checkboxOn: { backgroundColor: theme.accent, borderColor: theme.accent },
  toggleText: { color: theme.text, fontSize: 13 },
  error: { color: theme.accent, fontSize: 13, marginTop: 12 },
  button: { backgroundColor: theme.accent, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 18 },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  hints: { marginTop: 20 },
  hintTitle: { color: theme.muted, fontSize: 12, marginBottom: 8, textAlign: 'center' },
  hint: { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  hintText: { color: theme.text, fontWeight: '700' },
  hintSub: { color: theme.muted, fontSize: 12 }
});
