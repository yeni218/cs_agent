import React, { useEffect, useState, useCallback } from 'react';
import { FlatList, View, Text, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { listAssistants } from '../api/vapi.js';
import { Card, Pill, theme } from '../components/ui.js';

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('tr-TR') : '—');

export default function AssistantsScreen({ client }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems(await listAssistants(client, { limit: 100 }));
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
      data={items}
      keyExtractor={(a) => a.id}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={theme.accent} />}
      ListHeaderComponent={
        error ? <Card style={styles.err}><Text style={styles.errText}>{error}</Text></Card> : null
      }
      ListEmptyComponent={<Text style={styles.empty}>Asistan yok.</Text>}
      renderItem={({ item }) => (
        <Card style={styles.item}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.id}>{item.id}</Text>
          <View style={styles.pills}>
            <Pill text={`LLM: ${item.model}`} color={theme.palette[2]} />
            <Pill text={`Ses: ${item.voice}`} color={theme.palette[3]} />
            <Pill text={`STT: ${item.transcriber}`} color={theme.palette[1]} />
          </View>
          <Text style={styles.meta}>Oluşturuldu {fmtDate(item.createdAt)} · Güncellendi {fmtDate(item.updatedAt)}</Text>
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
  name: { color: theme.text, fontWeight: '700', fontSize: 16 },
  id: { color: theme.muted, fontSize: 11 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  meta: { color: theme.muted, fontSize: 11, marginTop: 4 },
  err: { borderColor: theme.red, marginBottom: 12 },
  errText: { color: theme.red, fontSize: 13 },
  empty: { color: theme.muted, textAlign: 'center', marginTop: 40 }
});
