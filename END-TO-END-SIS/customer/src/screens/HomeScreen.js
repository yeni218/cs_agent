import React, { useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { getOverview } from '../api/customer.js';
import { Section, StatCard, Card, BarChart, ProgressBar, theme } from '../components/ui.js';

const tl = (v) => `₺${Number(v).toLocaleString('tr-TR')}`;
const pct = (v) => `%${Math.round(v * 100)}`;

export default function HomeScreen({ client }) {
  const [ov, setOv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try { setError(null); setOv(await getOverview(client)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [client]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  if (loading) return <View style={styles.centered}><ActivityIndicator color={theme.accent} /></View>;
  if (!ov) return <View style={styles.centered}><Text style={styles.err}>{error || 'Veri yok'}</Text></View>;

  const volume = (ov.volumeByDay || []).map((d, i) => ({
    label: d.day.slice(5), value: d.count, color: theme.palette[1]
  }));
  const usedPct = ov.usage.includedMinutes ? ov.usage.minutesUsed / ov.usage.includedMinutes : 0;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={theme.accent} />}>
      <Text style={styles.hello}>{ov.tenant.name}</Text>
      <Text style={styles.phone}>{ov.tenant.phoneNumber} · {ov.tenant.plan} plan</Text>

      {error ? <Card style={styles.errCard}><Text style={styles.err}>{error}</Text></Card> : null}

      <Section title="Bu dönem">
        <View style={styles.grid}>
          <StatCard label="Telefon Cirosu" value={tl(ov.revenue)} color={theme.green} icon="trending-up" />
          <StatCard label="Cevaplanma" value={pct(ov.answerRate)} sub={`${ov.totalCalls} çağrı`} icon="phone-incoming" />
          <StatCard label="Sipariş" value={String(ov.orders)} sub={`${ov.reservations} rezervasyon`} icon="shopping-bag" />
          <StatCard label="Ort. Sepet" value={tl(ov.avgTicket)} color={theme.amber} icon="tag" />
        </View>
      </Section>

      <Section title="Günlük Çağrı Hacmi">
        <Card><BarChart data={volume} /></Card>
      </Section>

      <Section title="Dakika Kullanımı">
        <Card>
          <View style={styles.usageRow}>
            <Text style={styles.usageText}>{ov.usage.minutesUsed} / {ov.usage.includedMinutes} dk</Text>
            <Text style={styles.usageSub}>{Math.round(usedPct * 100)}%</Text>
          </View>
          <ProgressBar value={ov.usage.minutesUsed} max={ov.usage.includedMinutes} color={theme.accent} />
        </Card>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
  hello: { color: theme.text, fontSize: 22, fontWeight: '800' },
  phone: { color: theme.muted, fontSize: 13, marginTop: 2, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  usageRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  usageText: { color: theme.text, fontWeight: '700' },
  usageSub: { color: theme.muted },
  errCard: { borderColor: theme.accent, marginBottom: 14 },
  err: { color: theme.accent, fontSize: 13 }
});
