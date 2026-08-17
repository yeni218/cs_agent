import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

// Bright, consumer-friendly theme with stronger contrast for readability.
export const theme = {
  bg: '#eef1f6',
  card: '#ffffff',
  border: '#cbd3e0',       // stronger border so cards read as cards
  text: '#0b1220',         // near-black primary text
  muted: '#475569',        // darker secondary text (was too light)
  faint: '#eaeef4',        // track/placeholder fills
  accent: '#d11241',       // brand red, AA-contrast on white
  accentBg: '#fdeaef',     // tinted background for active states
  green: '#15803d',
  amber: '#b45309',
  palette: ['#d11241', '#1d4ed8', '#15803d', '#b45309', '#6d28d9', '#0e7490']
};

export function Section({ title, children }) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function StatCard({ label, value, sub, color, icon }) {
  const tint = color || theme.accent;
  return (
    <Card style={styles.stat}>
      <View style={styles.statTop}>
        <Text style={styles.statLabel}>{label}</Text>
        {icon ? (
          <View style={[styles.statIcon, { backgroundColor: tint + '1a' }]}>
            <Feather name={icon} size={14} color={tint} />
          </View>
        ) : null}
      </View>
      <Text style={[styles.statValue, color && { color }]}>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </Card>
  );
}

// Small round icon chip, reusable.
export function IconChip({ name, color, size = 16, bg }) {
  const tint = color || theme.accent;
  return (
    <View style={[styles.chip, { backgroundColor: bg || tint + '1a' }]}>
      <Feather name={name} size={size} color={tint} />
    </View>
  );
}

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
            <View style={[styles.barFill, { width: `${(d.value / max) * 100}%`, backgroundColor: d.color || theme.accent }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function Pill({ text, color }) {
  return (
    <View style={[styles.pill, { borderColor: color || theme.border, backgroundColor: (color || theme.muted) + '18' }]}>
      <Text style={[styles.pillText, { color: color || theme.muted }]}>{text}</Text>
    </View>
  );
}

export function ProgressBar({ value, max, color }) {
  const pct = Math.min(100, max ? (value / max) * 100 : 0);
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: color || theme.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 20 },
  sectionTitle: { color: theme.text, fontSize: 15, fontWeight: '700', marginBottom: 10 },
  card: { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16, shadowColor: '#0b1220', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  stat: { flex: 1, minWidth: 150 },
  statTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  statIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  chip: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  statLabel: { color: theme.muted, fontSize: 12, fontWeight: '600', flex: 1, marginRight: 8 },
  statValue: { color: theme.text, fontSize: 25, fontWeight: '800' },
  statSub: { color: theme.muted, fontSize: 12, marginTop: 4 },
  barRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  barLabel: { color: theme.text, fontSize: 13, fontWeight: '500', flex: 1, marginRight: 8 },
  barValue: { color: theme.muted, fontSize: 13, fontWeight: '700' },
  barTrack: { height: 12, backgroundColor: theme.faint, borderRadius: 6, overflow: 'hidden' },
  barFill: { height: 12, borderRadius: 6 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  pillText: { fontSize: 11, fontWeight: '800' },
  progressTrack: { height: 14, backgroundColor: theme.faint, borderRadius: 8, overflow: 'hidden' },
  progressFill: { height: 14, borderRadius: 8 }
});
