import React, { useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { getOverview } from '../api/customer.js';
import { Section, StatCard, Card, BarChart, ProgressBar, theme } from '../components/ui.js';

const tl = (v) => `₺${Number(v).toLocaleString('tr-TR')}`;
const pct = (v) => `%${Math.round(v * 100)}`;
const outcomeLabels = {
  order: 'Sipariş',
  reservation: 'Rezervasyon',
  faq: 'Bilgi',
  missed: 'Kaçan',
  unknown: 'Diğer'
};

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

  // Keep the dashboard in sync with completed Vapi calls without revealing
  // internal COGS fields through a Realtime subscription to public.calls.
  useEffect(() => {
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [load]);

  if (loading) return <View style={styles.centered}><ActivityIndicator color={theme.accent} /></View>;
  if (!ov) return <View style={styles.centered}><Text style={styles.err}>{error || 'Veri yok'}</Text></View>;

  const volume = (ov.volumeByDay || []).map((d, i) => ({
    label: d.day.slice(5), value: d.count, color: theme.palette[1]
  }));
  const hourly = (ov.volumeByHour || []).map((d, i) => ({
    label: d.hour, value: d.count, color: theme.palette[i % theme.palette.length]
  }));
  const outcomes = (ov.outcomeBreakdown || []).map((d, i) => ({
    label: outcomeLabels[d.outcome] || d.outcome, value: d.count, color: theme.palette[i % theme.palette.length]
  }));
  const usage = ov.usage || { minutesUsed: 0, includedMinutes: 0 };
  const usedPct = usage.includedMinutes ? usage.minutesUsed / usage.includedMinutes : 0;

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
          <StatCard label="Dönüşüm" value={pct(ov.conversionRate || 0)} sub={`${ov.orders} sipariş`} icon="repeat" />
          <StatCard label="Ort. Sepet" value={tl(ov.avgTicket)} color={theme.amber} icon="tag" />
          <StatCard label="Kaçan Çağrı" value={String(ov.missedCalls || 0)} color={theme.accent} icon="phone-missed" />
          <StatCard label="Kaçan Tahmini" value={tl(ov.lostRevenueEstimate || 0)} sub="sipariş ortalamasıyla" color={theme.accent} icon="alert-circle" />
        </View>
      </Section>

      <Section title="Çağrı Akışı">
        <View style={styles.stack}>
          <Card>
            <Text style={styles.cardTitle}>Günlük hacim</Text>
            <BarChart data={volume} />
          </Card>
          {hourly.length ? (
            <Card>
              <Text style={styles.cardTitle}>Yoğun saatler</Text>
              <BarChart data={hourly} />
            </Card>
          ) : null}
          {outcomes.length ? (
            <Card>
              <Text style={styles.cardTitle}>Sonuç dağılımı</Text>
              <BarChart data={outcomes} />
            </Card>
          ) : null}
        </View>
      </Section>

      <Section title="Son Siparişler">
        <Card style={styles.orderCard}>
          {(ov.recentOrders || []).length ? (ov.recentOrders || []).map((o) => (
            <View key={o.id} style={styles.orderRow}>
              <View style={styles.orderText}>
                <Text style={styles.orderName}>{o.customerName || 'Müşteri'}</Text>
                <Text style={styles.orderSummary} numberOfLines={1}>{o.summary || 'Sipariş'}</Text>
              </View>
              <Text style={styles.orderAmount}>{tl(o.amount || 0)}</Text>
            </View>
          )) : <Text style={styles.empty}>Henüz sipariş yok.</Text>}
        </Card>
      </Section>

      <Section title="Dakika Kullanımı">
        <Card>
          <View style={styles.usageRow}>
            <Text style={styles.usageText}>{usage.minutesUsed} / {usage.includedMinutes} dk</Text>
            <Text style={styles.usageSub}>{Math.round(usedPct * 100)}%</Text>
          </View>
          <ProgressBar value={usage.minutesUsed} max={usage.includedMinutes} color={theme.accent} />
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
  stack: { gap: 12 },
  cardTitle: { color: theme.text, fontWeight: '800', fontSize: 14, marginBottom: 10 },
  orderCard: { gap: 0 },
  orderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomColor: theme.border, borderBottomWidth: 1 },
  orderText: { flex: 1 },
  orderName: { color: theme.text, fontWeight: '800', fontSize: 14 },
  orderSummary: { color: theme.muted, fontSize: 12, marginTop: 2 },
  orderAmount: { color: theme.green, fontWeight: '800', fontSize: 14 },
  usageRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  usageText: { color: theme.text, fontWeight: '700' },
  usageSub: { color: theme.muted },
  errCard: { borderColor: theme.accent, marginBottom: 14 },
  err: { color: theme.accent, fontSize: 13 },
  empty: { color: theme.muted, fontSize: 13, textAlign: 'center', paddingVertical: 10 }
});
