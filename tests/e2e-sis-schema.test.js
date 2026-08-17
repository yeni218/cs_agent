import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration1 = readFileSync(new URL('../END-TO-END-SIS/supabase/migrations/0001_init.sql', import.meta.url), 'utf8');
const migration2 = readFileSync(new URL('../END-TO-END-SIS/supabase/migrations/0002_production_hardening.sql', import.meta.url), 'utf8');
const migrations = `${migration1}\n${migration2}`;

test('customer calls view is cost-free after production migrations', () => {
  const viewMatches = [...migrations.matchAll(/create or replace view public\.customer_calls[\s\S]*?;/g)];
  assert.ok(viewMatches.length >= 1);

  const latestView = viewMatches.at(-1)[0];
  assert.match(latestView, /where tenant_id = public\.current_tenant_id\(\)/);
  assert.doesNotMatch(latestView, /\bcost\b/);
  assert.doesNotMatch(latestView, /\bcost_breakdown\b/);
});

test('production cost tables are admin-only through RLS', () => {
  for (const table of ['call_usage_events', 'telephony_cdrs', 'cost_reconciliations', 'audit_log']) {
    assert.match(migrations, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migrations, new RegExp(`create policy ${table}_admin_only on public\\.${table}`));
  }
});

test('recording storage is private and tenant scoped', () => {
  assert.match(migration2, /'call-recordings'/);
  assert.match(migration2, /false,\s*104857600/);
  assert.match(migration2, /bucket_id = 'call-recordings'/);
  assert.match(migration2, /storage\.foldername\(name\)\)\[1\] = public\.current_tenant_id\(\)/);
});
