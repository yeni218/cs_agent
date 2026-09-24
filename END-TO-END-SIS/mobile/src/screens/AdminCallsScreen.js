import React, { useEffect, useState, useCallback } from 'react';
import { FlatList, View, Text, TouchableOpacity, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { listAdminCalls } from '../api/admin.js';
import { Card, BarChart, theme } from '../components/ui.js';
import CallDetail from './CallDetail.js';

const usd = (v) => `$${Number(v).toFixed(3)}`;

export default function AdminCallsScreen({ client }) {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    try { setError(null); setCalls(await listAdminCalls(client)); }
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
        ListEmptyComponent={<Text style={styles.empty}>Çağrı yok.</Text>}
        renderItem={({ item }) => {
          const cb = item.costBreakdown || {};
          const bars = [
            { label: 'Telefon', value: cb.transport || 0, color: theme.palette[1] },
            { label: 'STT', value: cb.stt || 0, color: theme.palette[2] },
            { label: 'LLM', value: cb.llm || 0, color: theme.palette[3] },
            { label: 'TTS', value: cb.tts || 0, color: theme.palette[4] }
          ];
          return (
            <TouchableOpacity activeOpacity={0.7} onPress={() => setSelected(item.id)}>
              <Card style={styles.item}>
                <View style={styles.rowBetween}>
                  <Text style={styles.id}>{item.id}</Text>
                  <Text style={styles.cost}>{usd(item.cost)}</Text>
                </View>
                <Text style={styles.meta}>{item.tenantId} · {Math.round(item.durationSec)}s</Text>
                <View style={{ marginTop: 8 }}><BarChart data={bars} format={usd} /></View>
              </Card>
            </TouchableOpacity>
          );
        }}
      />
      {selected ? <CallDetail client={client} callId={selected} isAdmin onClose={() => setSelected(null)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, gap: 10 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
  item: { gap: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  id: { color: theme.text, fontWeight: '700' },
  cost: { color: theme.accent, fontWeight: '800' },
  meta: { color: theme.muted, fontSize: 12 },
  errCard: { borderColor: theme.accent, marginBottom: 12 },
  err: { color: theme.accent },
  empty: { color: theme.muted, textAlign: 'center', marginTop: 40 }
});
