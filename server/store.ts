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

// --- Auth : credentials + tokens (backend Postgres async, miroir de db.ts) ---
export async function getCredential(memberId: string): Promise<{ password_hash: string; pwd_version: number } | null> {
  const c = await prisma.credential.findUnique({ where: { memberId } });
  return c ? { password_hash: c.passwordHash, pwd_version: c.pwdVersion } : null;
}

export async function upsertCredential(memberId: string, passwordHash: string): Promise<void> {
  await prisma.credential.upsert({
    where: { memberId },
    create: { memberId, passwordHash, pwdVersion: 0 },
    update: { passwordHash, pwdVersion: { increment: 1 } },
  });
}

export async function insertCredentialIfAbsent(memberId: string, passwordHash: string): Promise<void> {
  // upsert avec update:{} = INSERT OR IGNORE (ne touche pas un credential existant).
  await prisma.credential.upsert({ where: { memberId }, create: { memberId, passwordHash }, update: {} });
}

export async function countCredentials(): Promise<number> {
  return prisma.credential.count();
}

export async function insertToken(token: string, memberId: string, purpose: string, expiresAt: number): Promise<void> {
  await prisma.token.create({ data: { token, memberId, purpose, expiresAt: BigInt(expiresAt) } });
}

// ponytail: findUnique+update non-atomique (comme la version SQLite) ; OK en mono-instance
// Coolify. Passer à un updateMany gardé (where usedAt:null) si un jour multi-instance.
export async function consumeToken(token: string, now: number): Promise<{ memberId: string; purpose: string } | null> {
  const row = await prisma.token.findUnique({ where: { token } });
  if (!row || row.usedAt || now > Number(row.expiresAt)) return null;
  await prisma.token.update({ where: { token }, data: { usedAt: BigInt(now) } });
  return { memberId: row.memberId, purpose: row.purpose };
}

// One-shot migration from the old SQLite blob store into Postgres. Canonicalizes
// every item (M5 snake_case) at the boundary. Replaces target collections via
// setCollection → idempotent for a fresh/rerun target.
export async function migrateFromSqlite(sqlitePath: string): Promise<{ collections: Record<string, number>; kv: string[]; credentials: number; tokens: number }> {
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
    // Tables auth — copie brute (aucune canonicalisation). SANS ça, personne ne peut
    // se reconnecter après le cutover : les hashs restent dans l'ancien SQLite.
    const creds = sdb.prepare('SELECT member_id, password_hash, pwd_version FROM credentials').all() as
      { member_id: string; password_hash: string; pwd_version: number }[];
    for (const c of creds) {
      await prisma.credential.upsert({
        where: { memberId: c.member_id },
        create: { memberId: c.member_id, passwordHash: c.password_hash, pwdVersion: c.pwd_version ?? 0 },
        update: { passwordHash: c.password_hash, pwdVersion: c.pwd_version ?? 0 },
      });
    }
    const toks = sdb.prepare('SELECT token, member_id, purpose, expires_at, used_at FROM tokens').all() as
      { token: string; member_id: string; purpose: string; expires_at: number; used_at: number | null }[];
    for (const t of toks) {
      await prisma.token.upsert({
        where: { token: t.token },
        create: { token: t.token, memberId: t.member_id, purpose: t.purpose, expiresAt: BigInt(t.expires_at), usedAt: t.used_at == null ? null : BigInt(t.used_at) },
        update: {},
      });
    }
    return { collections, kv, credentials: creds.length, tokens: toks.length };
  } finally {
    sdb.close();
  }
}
