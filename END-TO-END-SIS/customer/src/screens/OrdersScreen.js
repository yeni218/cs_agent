import React, { useEffect, useState, useCallback } from 'react';
import { FlatList, View, Text, TouchableOpacity, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { listCalls } from '../api/customer.js';
import { Card, Pill, IconChip, theme } from '../components/ui.js';
import CallDetail from './CallDetail.js';

const tl = (v) => `₺${Number(v).toLocaleString('tr-TR')}`;
const fmt = (iso) => new Date(iso).toLocaleString('tr-TR');
const outcomeInfo = {
  order: { label: 'Sipariş', color: theme.green, icon: 'shopping-bag' },
  reservation: { label: 'Rezervasyon', color: theme.palette[1], icon: 'calendar' },
  faq: { label: 'Bilgi', color: theme.muted, icon: 'info' },
  missed: { label: 'Kaçan', color: theme.accent, icon: 'phone-missed' }
};

export default function OrdersScreen({ client }) {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    try { setError(null); setCalls(await listCalls(client)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [client]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  if (loading) return <View style={styles.centered}><ActivityIndicator color={theme.accent} /></View>;

  return (
    <>
      <FlatList
        style={styles.root} contentContainerStyle={styles.content} data={calls} keyExtractor={(c) => c.id}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={theme.accent} />}
        ListHeaderComponent={error ? <Card style={styles.errCard}><Text style={styles.err}>{error}</Text></Card> : null}
        ListEmptyComponent={<Text style={styles.empty}>Henüz çağrı yok.</Text>}
        renderItem={({ item }) => {
          const oi = outcomeInfo[item.outcome] || outcomeInfo.faq;
          return (
            <TouchableOpacity activeOpacity={0.7} onPress={() => setSelected(item.id)}>
              <Card style={styles.item}>
                <View style={styles.headRow}>
                  <IconChip name={oi.icon} color={oi.color} />
                  <View style={styles.headText}>
                    <Text style={styles.customer}>{item.customerName}</Text>
                    <Text style={styles.summary} numberOfLines={1}>{item.summary}</Text>
                  </View>
                  <Pill text={oi.label} color={oi.color} />
                </View>
                <View style={styles.footRow}>
                  <Text style={styles.meta}>{fmt(item.startedAt)}</Text>
                  {item.orderAmount > 0
                    ? <Text style={styles.amount}>{tl(item.orderAmount)}</Text>
                    : <Text style={styles.meta}>{Math.round(item.durationSec)}s</Text>}
                </View>
              </Card>
            </TouchableOpacity>
          );
        }}
      />
      {selected ? <CallDetail client={client} callId={selected} isAdmin={false} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, gap: 10 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
  item: { gap: 10 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headText: { flex: 1 },
  footRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopColor: theme.border, borderTopWidth: 1, paddingTop: 8 },
  customer: { color: theme.text, fontWeight: '800', fontSize: 15 },
  summary: { color: theme.muted, fontSize: 13, marginTop: 1 },
  meta: { color: theme.muted, fontSize: 12 },
  amount: { color: theme.green, fontWeight: '800', fontSize: 15 },
  errCard: { borderColor: theme.accent, marginBottom: 12 },
  err: { color: theme.accent, fontSize: 13 },
  empty: { color: theme.muted, textAlign: 'center', marginTop: 40 }
});
