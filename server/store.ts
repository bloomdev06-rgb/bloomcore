// ponytail: Postgres/Prisma backing for the document store — same function names
// as db.ts but async. Standalone and unwired: nothing imports this yet, so the
// app stays on db.ts. Storage model mirrors db.ts (one row per item, full object
// in `data` = source of truth) but adds promoted indexed columns + a projected
// DepartmentMembership table for relational queries. Swap-in target for db.ts.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { DatabaseSync } from 'node:sqlite';
import { canonicalize } from '../packages/shared/migrate.ts';

// Singleton (avoid exhausting PG connections under tsx watch / repeated imports).
export const prisma = new PrismaClient();

type Registry = { model: string; promote: (item: any) => Record<string, unknown> };

// Soft-delete tombstone columns shared by most collections (Audit is append-only → excluded).
const tomb = (i: any) => ({ deletedAt: i.deletedAt ?? null, updatedAt: i.updatedAt ?? null });

// COLLECTION NAME (API/db string) → Prisma model delegate key + promoted columns.
const REGISTRY: Record<string, Registry> = {
  members: { model: 'member', promote: (i) => ({ branch: i.branch, level: i.level, integrationState: i.integrationState ?? null, bloomBusId: i.bloomBusId ?? null, ...tomb(i) }) },
  events: { model: 'event', promote: (i) => ({ branch: i.branch ?? null, type: i.type ?? null, date: i.date ?? null, closed: i.closed ?? null, ...tomb(i) }) },
  reports: { model: 'report', promote: (i) => ({ branch: i.targetBranch ?? null, reportType: i.reportType ?? null, departmentId: i.departmentId ?? null, eventId: i.eventId ?? null, date: i.date ?? null, ...tomb(i) }) },
  audits: { model: 'audit', promote: (i) => ({ branch: i.branch ?? null, actionType: i.actionType ?? null, entity: i.entity ?? null, timestamp: i.timestamp ?? null }) },
  notifications: { model: 'notification', promote: (i) => ({ branch: i.branch ?? null, targetMemberId: i.targetMemberId ?? null, read: i.read ?? null, ...tomb(i) }) },
  ministries: { model: 'ministry', promote: (i) => ({ branch: i.branch ?? null, ...tomb(i) }) },
  departments: { model: 'department', promote: (i) => ({ branch: i.branch ?? null, type: i.type ?? null, ministryId: i.ministryId ?? null, ...tomb(i) }) },
  activities: { model: 'activity', promote: (i) => ({ departmentId: i.departmentId ?? null, ...tomb(i) }) },
  projects: { model: 'project', promote: (i) => ({ branch: i.branch ?? null, scope: i.scope ?? null, ministryId: i.ministryId ?? null, ...tomb(i) }) },
  bus_lines: { model: 'bloomBus', promote: (i) => ({ ...tomb(i) }) },
  certifications: { model: 'certification', promote: (i) => ({ memberId: i.memberId ?? null, ...tomb(i) }) },
  integration_reports: { model: 'integrationReport', promote: (i) => ({ memberId: i.memberId ?? null, ...tomb(i) }) },
  forms: { model: 'formDefinition', promote: (i) => ({ ...tomb(i) }) },
  delegations: { model: 'delegation', promote: (i) => ({ ...tomb(i) }) },
  admins: { model: 'adminAccount', promote: (i) => ({ ...tomb(i) }) },
  capability_overrides: { model: 'capabilityOverride', promote: (i) => ({ branch: i.branchId ?? null, ...tomb(i) }) },
  special_authorizations: { model: 'specialAuthorization', promote: (i) => ({ branch: i.branchId ?? null, ...tomb(i) }) },
};

function requireReg(name: string): Registry {
  const reg = REGISTRY[name];
  if (!reg) throw new Error(`store: unknown collection '${name}'`);
  return reg;
}

// Delegate off any client (prisma or a $transaction tx). Loose typing on purpose.
const delegate = (client: any, reg: Registry) => client[reg.model] as any;

// Full row: id + promoted columns + the whole object as `data` (source of truth).
const rowFor = (reg: Registry, item: any) => ({ id: String(item.id), ...reg.promote(item), data: item });

// Projection of Member.departments ({deptId: fonction}) + deptSections into rows.
function membershipRows(member: any): any[] {
  const departments = member?.departments && typeof member.departments === 'object' ? member.departments : {};
  const sections = member?.deptSections && typeof member.deptSections === 'object' ? member.deptSections : {};
  return Object.entries(departments).map(([deptId, fn]) => ({
    id: `${member.id}::${deptId}`,
    memberId: String(member.id),
    departmentId: deptId,
    function: String(fn),
    sectionId: sections[deptId] ?? null,
  }));
}

// Rebuild one member's memberships (delete this member's rows, re-create from its map).
async function syncMemberships(client: any, member: any): Promise<void> {
  await client.departmentMembership.deleteMany({ where: { memberId: String(member.id) } });
  const rows = membershipRows(member);
  if (rows.length) await client.departmentMembership.createMany({ data: rows });
}

export async function getCollection(name: string): Promise<any[]> {
  const reg = requireReg(name);
  const rows = await delegate(prisma, reg).findMany({ orderBy: { id: 'asc' } });
  return rows.map((r: any) => r.data);
}

// Replace-all (mirrors db.ts). deleteMany on Member cascades memberships away (FK
// onDelete: Cascade), so members exist before we re-project memberships.
export async function setCollection(name: string, items: any[]): Promise<void> {
  const reg = requireReg(name);
  await prisma.$transaction(async (tx) => {
    const m = delegate(tx, reg);
    await m.deleteMany({});
    for (const item of items) await m.create({ data: rowFor(reg, item) });
    if (name === 'members') for (const item of items) await syncMemberships(tx, item);
  });
}

// Upsert incoming + keep tombstones — never deletes a row. Members re-project.
export async function mergeCollection(name: string, items: any[]): Promise<void> {
  const reg = requireReg(name);
  await prisma.$transaction(async (tx) => {
    const m = delegate(tx, reg);
    for (const item of items) {
      const data = rowFor(reg, item);
      await m.upsert({ where: { id: String(item.id) }, create: data, update: data });
      if (name === 'members') await syncMemberships(tx, item);
    }
  });
}

// Insert-or-ignore (append-only journals: audits, derived notifications). Never
// deletes, never overwrites. Only projects memberships for rows actually inserted.
export async function appendToCollection(name: string, items: any[]): Promise<void> {
  if (items.length === 0) return;
  const reg = requireReg(name);
  await prisma.$transaction(async (tx) => {
    const m = delegate(tx, reg);
    for (const item of items) {
      const { count } = await m.createMany({ data: [rowFor(reg, item)], skipDuplicates: true });
      if (name === 'members' && count > 0) await syncMemberships(tx, item);
    }
  });
}

export async function getKv<T = unknown>(key: string): Promise<T | null> {
  const row = await prisma.kv.findUnique({ where: { key } });
  return row ? (row.data as unknown as T) : null;
}

export async function setKv(key: string, value: unknown): Promise<void> {
  await prisma.kv.upsert({ where: { key }, create: { key, data: value as any }, update: { data: value as any } });
}

// One-shot migration from the old SQLite blob store into Postgres. Canonicalizes
// every item (M5 snake_case) at the boundary. Replaces target collections via
// setCollection → idempotent for a fresh/rerun target.
export async function migrateFromSqlite(sqlitePath: string): Promise<{ collections: Record<string, number>; kv: string[] }> {
  const sdb = new DatabaseSync(sqlitePath);
  try {
    const collections: Record<string, number> = {};
    const names = (sdb.prepare('SELECT DISTINCT name FROM collections').all() as { name: string }[]).map((r) => r.name);
    for (const name of names) {
      if (!REGISTRY[name]) continue; // unknown collection → skip (nothing to write it into)
      const rows = sdb.prepare('SELECT id, data FROM collections WHERE name = ?').all(name) as { id: string; data: string }[];
      const items = rows.map((r) => canonicalize(name, JSON.parse(r.data)));
      await setCollection(name, items);
      collections[name] = items.length;
    }
    const kv: string[] = [];
    for (const { key, data } of sdb.prepare('SELECT key, data FROM kv').all() as { key: string; data: string }[]) {
      if (key.startsWith('_')) continue; // internal flags (_m5_migrated, …) are not domain KV
      await setKv(key, JSON.parse(data));
      kv.push(key);
    }
    return { collections, kv };
  } finally {
    sdb.close();
  }
}
