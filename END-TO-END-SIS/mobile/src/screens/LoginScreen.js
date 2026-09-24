import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView } from 'react-native';
import { login } from '../api/auth.js';
import { theme } from '../components/ui.js';

// Single login, direct to Supabase. The account (role) decides which app you get.
export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onLogin(await login({ email, password }));
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
          placeholder="••••••" placeholderTextColor={theme.muted} onSubmitEditing={submit} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={styles.button} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Giriş Yap</Text>}
        </TouchableOpacity>
      </View>
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
  error: { color: theme.accent, fontSize: 13, marginTop: 12 },
  button: { backgroundColor: theme.accent, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 18 },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 15 }
});
