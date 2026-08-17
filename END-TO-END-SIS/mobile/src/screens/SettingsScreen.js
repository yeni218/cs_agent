import React, { useState } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { PRESETS } from '../config.js';
import { Section, Card, theme } from '../components/ui.js';

// Switching the backend (Vapi ↔ our sovereign backend) is just picking a preset
// or editing baseUrl here — no other screen changes. That's the whole design.
export default function SettingsScreen({ config, onSave }) {
  const [preset, setPreset] = useState(config.preset);
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [apiKey, setApiKey] = useState(config.apiKey);

  const choose = (key) => {
    setPreset(key);
    setBaseUrl(PRESETS[key].baseUrl);
  };

  const save = () => {
    onSave({ preset, baseUrl, apiKey, demo: preset === 'demo' });
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Section title="Veri Kaynağı">
        <View style={styles.presets}>
          {Object.entries(PRESETS).map(([key, p]) => (
            <TouchableOpacity
              key={key}
              onPress={() => choose(key)}
              style={[styles.preset, preset === key && styles.presetActive]}
            >
              <Text style={[styles.presetText, preset === key && styles.presetTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Section>

      {preset !== 'demo' && (
        <Section title="Bağlantı">
          <Card style={{ gap: 12 }}>
            <View>
              <Text style={styles.label}>Base URL</Text>
              <TextInput
                style={styles.input}
                value={baseUrl}
                onChangeText={setBaseUrl}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="https://api.vapi.ai"
                placeholderTextColor={theme.muted}
              />
            </View>
            <View>
              <Text style={styles.label}>API Key (Bearer)</Text>
              <TextInput
                style={styles.input}
                value={apiKey}
                onChangeText={setApiKey}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                placeholder="vapi private key"
                placeholderTextColor={theme.muted}
              />
            </View>
          </Card>
        </Section>
      )}

      <TouchableOpacity style={styles.save} onPress={save}>
        <Text style={styles.saveText}>Kaydet</Text>
      </TouchableOpacity>

      <Text style={styles.note}>
        Aynı Vapi-şekilli uç noktaları (/assistant, /call) kendi egemen
        backend'imiz de sunacak. Vapi'den kendi sistemimize geçmek için sadece
        Base URL'i değiştirmek yeterli — uygulamanın geri kalanı aynı kalır.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16 },
  presets: { gap: 10 },
  preset: { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 14 },
  presetActive: { borderColor: theme.accent },
  presetText: { color: theme.text, fontWeight: '600' },
  presetTextActive: { color: theme.accent },
  label: { color: theme.muted, fontSize: 12, marginBottom: 6 },
  input: {
    backgroundColor: '#0b0e13', borderColor: theme.border, borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, color: theme.text
  },
  save: { backgroundColor: theme.accent, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 8 },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  note: { color: theme.muted, fontSize: 12, lineHeight: 18, marginTop: 18 }
});
