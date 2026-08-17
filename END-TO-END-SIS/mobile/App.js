import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, View, Text, TouchableOpacity, StyleSheet, Platform, StatusBar } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_CONFIG, STORAGE_KEY, PRESETS } from './src/config.js';
import { ApiClient } from './src/api/client.js';
import { theme } from './src/components/ui.js';
import AnalyticsScreen from './src/screens/AnalyticsScreen.js';
import CallsScreen from './src/screens/CallsScreen.js';
import AssistantsScreen from './src/screens/AssistantsScreen.js';
import SettingsScreen from './src/screens/SettingsScreen.js';

const TABS = [
  { key: 'analytics', label: 'Analiz' },
  { key: 'calls', label: 'Çağrılar' },
  { key: 'assistants', label: 'Asistanlar' },
  { key: 'settings', label: 'Ayarlar' }
];

export default function App() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [tab, setTab] = useState('analytics');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(saved) });
      } catch {
        // ignore; fall back to defaults
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const saveConfig = async (next) => {
    setConfig(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // non-fatal
    }
    setTab('analytics');
  };

  // Rebuilt whenever config changes → screens re-fetch from the new backend.
  const client = useMemo(
    () => new ApiClient({ baseUrl: config.baseUrl, apiKey: config.apiKey, demo: config.demo }),
    [config.baseUrl, config.apiKey, config.demo]
  );

  const sourceLabel = PRESETS[config.preset]?.label || config.baseUrl;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>END-TO-END-SIS</Text>
          <Text style={styles.subtitle}>Kaynak: {sourceLabel}</Text>
        </View>
      </View>

      <View style={styles.body}>
        {!ready ? null : tab === 'analytics' ? (
          <AnalyticsScreen client={client} />
        ) : tab === 'calls' ? (
          <CallsScreen client={client} />
        ) : tab === 'assistants' ? (
          <AssistantsScreen client={client} />
        ) : (
          <SettingsScreen config={config} onSave={saveConfig} />
        )}
      </View>

      <View style={styles.tabbar}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} style={styles.tab} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  header: { paddingHorizontal: 16, paddingVertical: 12, borderBottomColor: theme.border, borderBottomWidth: 1 },
  title: { color: theme.text, fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  subtitle: { color: theme.muted, fontSize: 12, marginTop: 2 },
  body: { flex: 1 },
  tabbar: { flexDirection: 'row', borderTopColor: theme.border, borderTopWidth: 1, backgroundColor: theme.card },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabText: { color: theme.muted, fontSize: 13, fontWeight: '600' },
  tabActive: { color: theme.accent }
});
