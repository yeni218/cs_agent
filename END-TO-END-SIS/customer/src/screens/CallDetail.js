import React, { useEffect, useState } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getCall } from '../api/customer.js';
import { getAdminCall } from '../api/admin.js';
import { Card, Pill, BarChart, IconChip, theme } from '../components/ui.js';

const tl = (v) => `₺${Number(v).toLocaleString('tr-TR')}`;
const usd = (v) => `$${Number(v).toFixed(3)}`;

// Backs Vapi GET /call/{id}. Customer detail is cost-free; admin adds the
// per-stage cost breakdown.
export default function CallDetail({ client, callId, isAdmin, onClose }) {
  const [call, setCall] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = isAdmin ? await getAdminCall(client, callId) : await getCall(client, callId);
        if (alive) setCall(data);
      } catch (e) { if (alive) setError(e.message); }
    })();
    return () => { alive = false; };
  }, [client, callId, isAdmin]);

  const sd = call?.analysis?.structuredData;
  const cb = call?.costBreakdown;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>Çağrı Detayı</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}><Feather name="x" size={22} color={theme.muted} /></TouchableOpacity>
          </View>

          {!call && !error ? (
            <View style={styles.center}><ActivityIndicator color={theme.accent} /></View>
          ) : error ? (
            <View style={styles.center}><Text style={styles.err}>{error}</Text></View>
          ) : (
            <ScrollView contentContainerStyle={styles.content}>
              <View style={styles.metaRow}>
                <Pill text={call.answered ? 'Cevaplandı' : 'Kaçan'} color={call.answered ? theme.green : theme.accent} />
                {call.durationSec ? <Text style={styles.meta}>{Math.round(call.durationSec)} sn</Text> : null}
                {call.customerName ? <Text style={styles.meta}>{call.customerName}</Text> : null}
              </View>

              {sd?.intent === 'order' && sd.items?.length ? (
                <Card style={styles.block}>
                  <Text style={styles.blockTitle}>Sipariş</Text>
                  {sd.items.map((it, i) => (
                    <View key={i} style={styles.orderRow}><Feather name="check" size={14} color={theme.green} /><Text style={styles.orderItem}>{it}</Text></View>
                  ))}
                  {sd.total ? <Text style={styles.total}>Toplam {tl(sd.total)}</Text> : null}
                </Card>
              ) : call.analysis?.summary ? (
                <Card style={styles.block}><Text style={styles.blockTitle}>Özet</Text><Text style={styles.summary}>{call.analysis.summary}</Text></Card>
              ) : null}

              <Card style={styles.block}>
                <Text style={styles.blockTitle}>Konuşma</Text>
                {(call.transcript || []).map((m, i) => (
                  <View key={i} style={[styles.bubble, m.role === 'user' ? styles.user : styles.assistant]}>
                    <Text style={[styles.bubbleText, m.role === 'user' && { color: '#fff' }]}>{m.text}</Text>
                  </View>
                ))}
              </Card>

              {call.recordingUrl ? (
                <Card style={styles.recording}>
                  <IconChip name="play" color={theme.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recTitle}>Kayıt</Text>
                    <Text style={styles.recUrl} numberOfLines={1}>{call.recordingUrl}</Text>
                  </View>
                </Card>
              ) : null}

              {isAdmin && cb ? (
                <Card style={styles.block}>
                  <Text style={styles.blockTitle}>Maliyet · {usd(call.cost)}</Text>
                  <BarChart format={usd} data={[
                    { label: 'Telefon', value: cb.transport || 0, color: theme.palette[1] },
                    { label: 'STT', value: cb.stt || 0, color: theme.palette[2] },
                    { label: 'LLM', value: cb.llm || 0, color: theme.palette[3] },
                    { label: 'TTS', value: cb.tts || 0, color: theme.palette[4] }
                  ]} />
                </Card>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(11,18,32,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '88%', paddingTop: 8 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14 },
  title: { color: theme.text, fontSize: 17, fontWeight: '800' },
  center: { padding: 40, alignItems: 'center' },
  err: { color: theme.accent },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  meta: { color: theme.muted, fontSize: 12.5 },
  block: { gap: 8 },
  blockTitle: { color: theme.text, fontWeight: '800', fontSize: 14 },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderItem: { color: theme.text, fontSize: 14 },
  total: { color: theme.green, fontWeight: '800', fontSize: 15, marginTop: 4 },
  summary: { color: theme.muted, fontSize: 13, lineHeight: 19 },
  bubble: { maxWidth: '85%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  assistant: { backgroundColor: theme.faint, alignSelf: 'flex-start' },
  user: { backgroundColor: theme.accent, alignSelf: 'flex-end' },
  bubbleText: { color: theme.text, fontSize: 13.5, lineHeight: 19 },
  recording: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  recTitle: { color: theme.text, fontWeight: '700' },
  recUrl: { color: theme.muted, fontSize: 11 }
});
