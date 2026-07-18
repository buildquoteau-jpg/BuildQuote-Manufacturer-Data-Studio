#!/usr/bin/env node
// Regenerates supabase/schema_complete.sql from the LIVE Data Studio schema.
//
// Why this exists (2026-07-18 audit): the hand-refreshed schema_complete.sql
// went stale for two months and still showed the pre-migration-026
// install_guide_url column — the exact column whose rename broke every live
// parser insert. A reference file that anyone (or Claude) is told to trust
// must be generated, not typed.
//
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local
// and fetches the PostgREST OpenAPI spec — the same source of truth the REST
// API itself serves from. No SQL editor round-trip needed.
//
// Run from repo root after applying any migration:
//     node scripts/refresh_schema_reference.mjs
//
// Then commit the diff. A surprising diff here IS the drift alarm.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const env = {};
for (const line of readFileSync(join(repoRoot, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const url = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local");
  process.exit(1);
}

const res = await fetch(`${url}/rest/v1/`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
if (!res.ok) {
  console.error(`OpenAPI fetch failed: HTTP ${res.status}`);
  process.exit(1);
}
const spec = await res.json();

const today = new Date().toISOString().slice(0, 10);
const project = url.replace(/^https?:\/\//, "").split(".")[0];

const lines = [
  "-- schema_complete.sql — GENERATED FILE, do not hand-edit.",
  `-- Last refreshed: ${today} from live project ${project} (PostgREST OpenAPI).`,
  "-- Regenerate after every applied migration:",
  "--     node scripts/refresh_schema_reference.mjs",
  "--",
  "-- REFERENCE ONLY — do not run this to migrate.",
  "-- Authoritative DDL lives in supabase/migrations/.",
  "-- NOT NULL is derived from the OpenAPI required list; defaults and",
  "-- constraints are shown where PostgREST exposes them.",
  "",
];

const tables = Object.keys(spec.definitions ?? {}).sort();
for (const table of tables) {
  const def = spec.definitions[table];
  const required = new Set(def.required ?? []);
  lines.push("-- ============================================================");
  lines.push(`-- ${table}`);
  lines.push("-- ============================================================");
  lines.push(`CREATE TABLE public.${table} (`);

  const cols = Object.entries(def.properties ?? {});
  const rendered = cols.map(([name, prop], i) => {
    const pgType = (prop.format || prop.type || "unknown").replace(/^public\./, "");
    const notNull = required.has(name) ? " NOT NULL" : "";
    const dflt = prop.default !== undefined ? ` DEFAULT ${prop.default}` : "";
    const pk = /Primary Key/i.test(prop.description || "") ? "  -- PK" : "";
    const comma = i < cols.length - 1 ? "," : "";
    return `    ${name.padEnd(28)} ${pgType}${notNull}${dflt}${comma}${pk}`;
  });
  lines.push(...rendered);
  lines.push(");");
  lines.push("");
}

lines.push("-- ============================================================");
lines.push("-- RPC endpoints exposed by PostgREST at refresh time");
lines.push("-- ============================================================");
for (const p of Object.keys(spec.paths ?? {}).filter((p) => p.startsWith("/rpc/")).sort()) {
  lines.push(`-- ${p}`);
}
lines.push("");

const outPath = join(repoRoot, "supabase", "schema_complete.sql");
writeFileSync(outPath, lines.join("\n"), "utf8");
console.log(`Wrote ${outPath} — ${tables.length} tables from ${project}`);
