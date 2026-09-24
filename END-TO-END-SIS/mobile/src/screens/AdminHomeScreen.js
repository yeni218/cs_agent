import React, { useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { getAdminOverview, listTenants } from '../api/admin.js';
import { Section, StatCard, Card, Pill, theme } from '../components/ui.js';

const tl = (v) => `₺${Number(v).toLocaleString('tr-TR')}`;
const usd = (v) => `$${Number(v).toFixed(3)}`;

export default function AdminHomeScreen({ client }) {
  const [ov, setOv] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [o, t] = await Promise.all([getAdminOverview(client), listTenants(client)]);
      setOv(o); setTenants(t);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [client]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  if (loading) return <View style={styles.centered}><ActivityIndicator color={theme.accent} /></View>;
  if (!ov) return <View style={styles.centered}><Text style={styles.err}>{error || 'Veri yok'}</Text></View>;

  const h = ov.systemHealth || {};
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={theme.accent} />}>

      <Section title="Platform Ekonomisi">
        <View style={styles.grid}>
          <StatCard label="MRR" value={tl(ov.mrr)} color={theme.green} sub={`${ov.activeTenants}/${ov.tenantCount} aktif`} icon="repeat" />
          <StatCard label="Toplam COGS" value={usd(ov.totalCogs)} color={theme.accent} icon="server" />
          <StatCard label="Brüt Marj" value={tl(ov.grossMargin)} sub={`%${ov.grossMarginPct}`} color={theme.green} icon="trending-up" />
          <StatCard label="Kiracı" value={String(ov.tenantCount)} icon="users" />
        </View>
      </Section>

      <Section title="Sistem Sağlığı">
        <Card>
          <View style={styles.health}>
            {Object.entries(h).map(([k, v]) => (
              <Pill key={k} text={`${k.toUpperCase()} · ${v}`} color={v === 'up' ? theme.green : theme.accent} />
            ))}
          </View>
        </Card>
      </Section>

      <Section title="Kiracılar (marj)">
        {tenants.map((t) => (
          <Card key={t.id} style={styles.tenant}>
            <View style={styles.rowBetween}>
              <Text style={styles.tName}>{t.name}</Text>
              <Pill text={t.status} color={t.status === 'active' ? theme.green : theme.amber} />
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.meta}>{t.plan.name} · {tl(t.revenue)}/ay · {t.minutesUsed} dk</Text>
              <Text style={[styles.margin, { color: t.margin >= 0 ? theme.green : theme.accent }]}>
                {tl(t.margin)} (%{t.marginPct})
              </Text>
            </View>
            <Text style={styles.cogs}>COGS {usd(t.cogs)} · {t.calls} çağrı</Text>
          </Card>
        ))}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  health: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tenant: { marginBottom: 10, gap: 6 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tName: { color: theme.text, fontWeight: '800', fontSize: 15 },
  meta: { color: theme.muted, fontSize: 12, flex: 1 },
  margin: { fontWeight: '800', fontSize: 14 },
  cogs: { color: theme.muted, fontSize: 11 },
  err: { color: theme.accent }
});
