import React, { useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getAssistant, getPhoneNumber, updateAssistant } from '../api/customer.js';
import { Section, Card, Pill, theme } from '../components/ui.js';

export default function AgentScreen({ client }) {
  const [a, setA] = useState(null);
  const [phone, setPhone] = useState(null);
  const [greeting, setGreeting] = useState('');
  const [openHours, setOpenHours] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [data, phoneData] = await Promise.all([getAssistant(client), getPhoneNumber(client)]);
      setA(data);
      setPhone(phoneData);
      setGreeting(data?.config?.greeting || '');
      setOpenHours(data?.config?.openHours || '');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [client]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const save = async () => {
    if (!a) return;
    setSaving(true); setSaved(false); setError(null);
    try {
      await updateAssistant(client, a.id, { greeting, openHours });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator color={theme.accent} /></View>;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Section title="Sesli Asistan">
        <Card>
          <Text style={styles.name}>{a?.name || 'Asistan'}</Text>
          <View style={styles.pills}><Pill text="Aktif" color={theme.green} /><Pill text="7/24" color={theme.palette[1]} /></View>
          <View style={styles.kv}><Text style={styles.k}>Dil</Text><Text style={styles.v}>{a?.config?.language === 'tr' ? 'Türkçe' : (a?.config?.language || '—')}</Text></View>
          <View style={styles.kv}><Text style={styles.k}>Ses</Text><Text style={styles.v}>{a?.voice?.voiceId || '—'}</Text></View>
          <View style={styles.kv}><Text style={styles.k}>Telefon</Text><Text style={styles.v}>{phone?.number || '—'}</Text></View>
          <View style={styles.kv}><Text style={styles.k}>Hat durumu</Text><Text style={styles.v}>{phone?.status || '—'}</Text></View>
        </Card>
      </Section>

      <Section title="Ayarlar">
        <Card style={{ gap: 14 }}>
          <View>
            <Text style={styles.label}>Karşılama mesajı</Text>
            <TextInput style={[styles.input, styles.multiline]} value={greeting} onChangeText={setGreeting}
              multiline placeholder="Hoş geldiniz..." placeholderTextColor={theme.muted} />
          </View>
          <View>
            <Text style={styles.label}>Çalışma saatleri</Text>
            <TextInput style={styles.input} value={openHours} onChangeText={setOpenHours}
              placeholder="11:00 - 23:00" placeholderTextColor={theme.muted} />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity style={[styles.save, saved && styles.savedBtn]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" />
              : <><Feather name={saved ? 'check' : 'save'} size={16} color="#fff" /><Text style={styles.saveText}>{saved ? 'Kaydedildi' : 'Kaydet'}</Text></>}
          </TouchableOpacity>
        </Card>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
  name: { color: theme.text, fontSize: 18, fontWeight: '800', marginBottom: 8 },
  pills: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', borderTopColor: theme.border, borderTopWidth: 1, paddingTop: 10, marginTop: 4 },
  k: { color: theme.muted, fontSize: 13 },
  v: { color: theme.text, fontSize: 13, fontWeight: '600' },
  label: { color: theme.muted, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: { backgroundColor: '#fff', borderColor: theme.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: theme.text },
  multiline: { minHeight: 74, textAlignVertical: 'top' },
  error: { color: theme.accent, fontSize: 13 },
  save: { flexDirection: 'row', gap: 8, backgroundColor: theme.accent, borderRadius: 12, padding: 14, alignItems: 'center', justifyContent: 'center' },
  savedBtn: { backgroundColor: theme.green },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 15 }
});
