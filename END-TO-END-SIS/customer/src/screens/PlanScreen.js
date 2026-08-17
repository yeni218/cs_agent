import React, { useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { getOverview } from '../api/customer.js';
import { Section, Card, ProgressBar, theme } from '../components/ui.js';

// Customer plan view — usage vs included minutes and the subscription tier.
// NOTE: shows the plan the customer bought; NEVER our infrastructure cost.
export default function PlanScreen({ client }) {
  const [ov, setOv] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setOv(await getOverview(client)); } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [client]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  if (loading) return <View style={styles.centered}><ActivityIndicator color={theme.accent} /></View>;
  if (!ov) return <View style={styles.centered}><Text style={styles.muted}>Veri yok</Text></View>;

  const { minutesUsed, includedMinutes } = ov.usage;
  const usedPct = includedMinutes ? minutesUsed / includedMinutes : 0;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Section title="Aboneliğiniz">
        <Card>
          <Text style={styles.plan}>{ov.tenant.plan} Plan</Text>
          <Text style={styles.muted}>Aylık dahil {includedMinutes} dakika · sınırsız eşzamanlı çağrı</Text>
          <View style={{ marginTop: 14 }}>
            <View style={styles.usageRow}>
              <Text style={styles.usageText}>{minutesUsed} / {includedMinutes} dk kullanıldı</Text>
              <Text style={styles.muted}>{Math.round(usedPct * 100)}%</Text>
            </View>
            <ProgressBar value={minutesUsed} max={includedMinutes} color={usedPct > 0.9 ? theme.accent : theme.green} />
          </View>
        </Card>
      </Section>

      <Section title="Planı Yükselt">
        <Card>
          <Text style={styles.muted}>Daha fazla dakika, çok şubeli yönetim ve POS
            entegrasyonu için planınızı yükseltin.</Text>
          <TouchableOpacity style={styles.cta}><Text style={styles.ctaText}>Planları Gör</Text></TouchableOpacity>
        </Card>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
  plan: { color: theme.text, fontSize: 20, fontWeight: '800' },
  muted: { color: theme.muted, fontSize: 13, lineHeight: 19 },
  usageRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  usageText: { color: theme.text, fontWeight: '700' },
  cta: { backgroundColor: theme.accent, borderRadius: 12, padding: 13, alignItems: 'center', marginTop: 14 },
  ctaText: { color: '#fff', fontWeight: '800' }
});
