import React, { useEffect, useState, useCallback } from 'react';
import { FlatList, View, Text, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { listCalls } from '../api/vapi.js';
import { Card, Pill, theme } from '../components/ui.js';

const statusColor = (s) => (s === 'ended' ? theme.green : s === 'in-progress' ? theme.amber : theme.muted);
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('tr-TR') : '—');
const fmtDur = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

export default function CallsScreen({ client }) {
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

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color={theme.accent} /></View>;
  }

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.content}
      data={calls}
      keyExtractor={(c) => c.id}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={theme.accent} />}
      ListHeaderComponent={
        error ? <Card style={styles.err}><Text style={styles.errText}>{error}</Text></Card> : null
      }
      ListEmptyComponent={<Text style={styles.empty}>Çağrı yok.</Text>}
      renderItem={({ item }) => (
        <Card style={styles.item}>
          <View style={styles.rowBetween}>
            <Text style={styles.id}>{item.id}</Text>
            <Pill text={item.status} color={statusColor(item.status)} />
          </View>
          <Text style={styles.meta}>{item.type} · {fmtTime(item.startedAt)}</Text>
          <View style={styles.rowBetween}>
            <Text style={styles.meta}>Süre {fmtDur(item.durationSec)}</Text>
            <Text style={styles.cost}>${item.cost.toFixed(3)}</Text>
          </View>
          {item.endedReason ? <Text style={styles.reason}>{item.endedReason}</Text> : null}
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, gap: 10 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
  item: { gap: 6 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  id: { color: theme.text, fontWeight: '700', fontSize: 14 },
  meta: { color: theme.muted, fontSize: 12 },
  cost: { color: theme.green, fontWeight: '700', fontSize: 14 },
  reason: { color: theme.amber, fontSize: 11 },
  err: { borderColor: theme.red, marginBottom: 12 },
  errText: { color: theme.red, fontSize: 13 },
  empty: { color: theme.muted, textAlign: 'center', marginTop: 40 }
});
