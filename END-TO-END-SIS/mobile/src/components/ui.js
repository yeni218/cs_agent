import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const theme = {
  bg: '#0e1116',
  card: '#161b22',
  border: '#232a34',
  text: '#e6edf3',
  muted: '#8b98a5',
  accent: '#3b82f6',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  palette: ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6']
};

export function Section({ title, children, right }) {
  return (
    <View style={styles.section}>
      {(title || right) && (
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function StatCard({ label, value, sub, color }) {
  return (
    <Card style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color && { color }]}>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </Card>
  );
}

// Dependency-free horizontal bar chart. data: [{ label, value, color }]
export function BarChart({ data, format = (v) => v }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={{ gap: 10 }}>
      {data.map((d, i) => (
        <View key={d.label + i}>
          <View style={styles.barRow}>
            <Text style={styles.barLabel} numberOfLines={1}>{d.label}</Text>
            <Text style={styles.barValue}>{format(d.value)}</Text>
          </View>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                { width: `${(d.value / max) * 100}%`, backgroundColor: d.color || theme.accent }
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

export function Pill({ text, color }) {
  return (
    <View style={[styles.pill, { borderColor: color || theme.border }]}>
      <Text style={[styles.pillText, { color: color || theme.muted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 20 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { color: theme.text, fontSize: 15, fontWeight: '700' },
  card: { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 14, padding: 14 },
  stat: { flex: 1, minWidth: 150 },
  statLabel: { color: theme.muted, fontSize: 12, marginBottom: 6 },
  statValue: { color: theme.text, fontSize: 22, fontWeight: '800' },
  statSub: { color: theme.muted, fontSize: 11, marginTop: 4 },
  barRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  barLabel: { color: theme.text, fontSize: 13, flex: 1, marginRight: 8 },
  barValue: { color: theme.muted, fontSize: 13, fontWeight: '600' },
  barTrack: { height: 10, backgroundColor: '#0b0e13', borderRadius: 6, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 6 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  pillText: { fontSize: 11, fontWeight: '600' }
});
