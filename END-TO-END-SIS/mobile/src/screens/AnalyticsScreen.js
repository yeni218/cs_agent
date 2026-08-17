import React, { useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { listCalls, computeAnalytics } from '../api/vapi.js';
import { Section, StatCard, Card, BarChart, theme } from '../components/ui.js';

const usd = (v) => `$${v.toFixed(3)}`;
const secs = (v) => `${Math.round(v)}s`;

export default function AnalyticsScreen({ client }) {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setCalls(await listCalls(client, { limit: 100 }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  if (loading) return <Centered><ActivityIndicator color={theme.accent} /></Centered>;

  const a = computeAnalytics(calls);
  const breakdown = [
    { label: 'Telefon (transport)', value: a.breakdown.transport, color: theme.palette[0] },
    { label: 'STT', value: a.breakdown.stt, color: theme.palette[1] },
    { label: 'LLM', value: a.breakdown.llm, color: theme.palette[2] },
    { label: 'TTS', value: a.breakdown.tts, color: theme.palette[3] },
    { label: 'Platform', value: a.breakdown.vapi, color: theme.palette[4] }
  ].sort((x, y) => y.value - x.value);

  const statusData = Object.entries(a.byStatus).map(([label, value], i) => ({
    label, value, color: theme.palette[i % theme.palette.length]
  }));
  const typeData = Object.entries(a.byType).map(([label, value], i) => ({
    label, value, color: theme.palette[i % theme.palette.length]
  }));

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={theme.accent} />}
    >
      {error ? <Card style={styles.err}><Text style={styles.errText}>{error}</Text></Card> : null}

      <Section title="Genel Bakış">
        <View style={styles.grid}>
          <StatCard label="Toplam Çağrı" value={String(a.totalCalls)} sub={`${a.endedCalls} tamamlandı`} />
          <StatCard label="Toplam Maliyet" value={usd(a.totalCost)} color={theme.green} />
          <StatCard label="Ort. Süre" value={secs(a.avgDurationSec)} />
          <StatCard label="Dakika Başı" value={usd(a.costPerMin)} sub="maliyet / konuşma dk" color={theme.amber} />
        </View>
      </Section>

      <Section title="Maliyet Dağılımı (bileşen bazında)">
        <Card><BarChart data={breakdown} format={usd} /></Card>
      </Section>

      <Section title="Çağrı Durumu">
        <Card><BarChart data={statusData} /></Card>
      </Section>

      <Section title="Çağrı Türü">
        <Card><BarChart data={typeData} /></Card>
      </Section>
    </ScrollView>
  );
}

function Centered({ children }) {
  return <View style={styles.centered}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  err: { borderColor: theme.red, marginBottom: 16 },
  errText: { color: theme.red, fontSize: 13 }
});
