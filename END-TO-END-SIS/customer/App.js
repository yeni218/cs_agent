import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SESSION_KEY, DEFAULT_BASE_URL } from './src/config.js';
import { ApiClient } from './src/api/client.js';
import { theme } from './src/components/ui.js';
import LoginScreen from './src/screens/LoginScreen.js';
import HomeScreen from './src/screens/HomeScreen.js';
import OrdersScreen from './src/screens/OrdersScreen.js';
import AgentScreen from './src/screens/AgentScreen.js';
import PlanScreen from './src/screens/PlanScreen.js';
import AdminHomeScreen from './src/screens/AdminHomeScreen.js';
import AdminCallsScreen from './src/screens/AdminCallsScreen.js';

const CUSTOMER_TABS = [
  { key: 'home', label: 'Genel', icon: 'home', C: HomeScreen },
  { key: 'orders', label: 'Çağrılar', icon: 'phone-call', C: OrdersScreen },
  { key: 'agent', label: 'Asistan', icon: 'cpu', C: AgentScreen },
  { key: 'plan', label: 'Plan', icon: 'credit-card', C: PlanScreen }
];
const ADMIN_TABS = [
  { key: 'ahome', label: 'Panel', icon: 'bar-chart-2', C: AdminHomeScreen },
  { key: 'acalls', label: 'Maliyet', icon: 'dollar-sign', C: AdminCallsScreen }
];

export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}

function Root() {
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [tabKey, setTabKey] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(SESSION_KEY);
        if (saved) setSession(JSON.parse(saved));
      } catch { /* ignore */ }
      finally { setReady(true); }
    })();
  }, []);

  const onLogin = async (s) => {
    setSession(s);
    setTabKey(null);
    try { await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* ignore */ }
  };
  const onLogout = async () => {
    setSession(null);
    try { await AsyncStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  };

  const client = useMemo(
    () => (session ? new ApiClient({ baseUrl: session.baseUrl, session, demo: session.demo }) : null),
    [session]
  );

  if (!ready) return <View style={styles.root} />;

  if (!session) {
    return (
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar style="dark" />
        <LoginScreen defaultBaseUrl={DEFAULT_BASE_URL} onLogin={onLogin} />
      </View>
    );
  }

  const tabs = session.role === 'admin' ? ADMIN_TABS : CUSTOMER_TABS;
  const active = tabs.find((t) => t.key === tabKey) || tabs[0];
  const Screen = active.C;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      {/* Header — top inset keeps it clear of the status bar / notch */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>Afiyet<Text style={{ color: theme.accent }}>Sesli</Text></Text>
          <Text style={styles.sub} numberOfLines={1}>
            {session.role === 'admin' ? 'Yönetici' : 'Restoran'} · {session.name}{session.demo ? ' · Demo' : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={onLogout} style={styles.logoutBtn} hitSlop={10}>
          <Feather name="log-out" size={14} color={theme.accent} />
          <Text style={styles.logout}>Çıkış</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}><Screen client={client} /></View>

      {/* Tab bar — bottom inset lifts it above Android nav buttons / gesture bar */}
      <View style={[styles.tabbar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {tabs.map((t) => {
          const on = active.key === t.key;
          return (
            <TouchableOpacity key={t.key} style={styles.tab} onPress={() => setTabKey(t.key)} activeOpacity={0.7}>
              <View style={[styles.tabIndicator, on && styles.tabIndicatorOn]} />
              <Feather name={t.icon} size={21} color={on ? theme.accent : theme.muted} />
              <Text style={[styles.tabText, on && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 14, backgroundColor: theme.card, borderBottomColor: theme.border, borderBottomWidth: 1 },
  brand: { color: theme.text, fontSize: 21, fontWeight: '900', letterSpacing: 0.3 },
  sub: { color: theme.muted, fontSize: 12.5, marginTop: 2 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: theme.accentBg },
  logout: { color: theme.accent, fontWeight: '800', fontSize: 13 },
  body: { flex: 1 },
  tabbar: { flexDirection: 'row', borderTopColor: theme.border, borderTopWidth: 1, backgroundColor: theme.card, paddingTop: 6 },
  tab: { flex: 1, alignItems: 'center', paddingTop: 6, paddingBottom: 4, gap: 2 },
  tabIndicator: { height: 3, width: 26, borderRadius: 3, backgroundColor: 'transparent', marginBottom: 4 },
  tabIndicatorOn: { backgroundColor: theme.accent },
  tabText: { color: theme.muted, fontSize: 12, fontWeight: '700', marginTop: 3 },
  tabTextActive: { color: theme.accent }
});
