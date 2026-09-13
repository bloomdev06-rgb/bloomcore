// Import CSV de Bloom Bus — crée les bus ET assigne un responsable (membre existant) en
// une passe. Un bus n'a pas de champ responsable en base (BusLineSchema) : le lien vit
// sur le Member (departments.dept_bloom_bus + bloomBusId), d'où les deux listes en sortie.
// ponytail: petit parser dédié plutôt que factoriser avec csvImport.ts pour un 2e appelant.
import { BloomBusEntity, Member, DeptFunction, BusRole, ImportBusMemberState } from '../types';
import { parseCsv } from './csvImport';
import { normalizePhone } from './phone';
import { isBusBranch } from '../../packages/domain/busBranch';

const BUS_DEPT_ID = 'dept_bloom_bus';
const BUS_FUNCTIONS: DeptFunction[] = ['responsable', 'capitaine', 'responsable_zone', 'responsable_commune'];
// §27 — capitaine/responsable_zone/responsable_commune sont des fonctions du MODULE (busRole),
// pas du département : le serveur rejette désormais ce vocabulaire dans `departments` (400).
const TERRITORIAL: BusRole[] = ['capitaine', 'responsable_zone', 'responsable_commune'];

export function importBusMemberState(member: Member, departmentId = BUS_DEPT_ID): ImportBusMemberState {
  return {
    bloomBusId: member.bloomBusId ?? null,
    busRole: member.busRole ?? null,
    busRoles: member.busRoles ? [...member.busRoles] : null,
    busDepartmentFunction: member.departments?.[departmentId] ?? null,
  };
}

const stripDiacritics = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s: string) => stripDiacritics((s ?? '').trim().toLowerCase());

function headerKey(h: string): string {
  const n = norm(h);
  if (['nom', 'name'].includes(n)) return 'name';
  if (['commune', 'ville'].includes(n)) return 'commune';
  if (['zone'].includes(n)) return 'zone';
  if (['branche', 'branch'].includes(n)) return 'branch';
  if (['latitude', 'lat'].includes(n)) return 'centerLat';
  if (['longitude', 'lng', 'lon'].includes(n)) return 'centerLng';
  if (['responsabletelephone', 'telephone responsable', 'telephone', 'tel'].includes(n)) return 'responsablePhone';
  if (['responsableemail', 'email responsable', 'email', 'mail'].includes(n)) return 'responsableEmail';
  if (['fonctionresponsable', 'fonction responsable', 'fonction'].includes(n)) return 'fonction';
  return n;
}

export interface BusImportResult {
  buses: BloomBusEntity[];
  memberPatches: Member[];
  errors: { line: number; reason: string }[];
}

export function importBusesFromCsv(
  text: string,
  existingMembers: Member[],
  now: Date = new Date(),
  activeBranch?: 'church' | 'light' | 'global',
): BusImportResult {
  const rows = parseCsv(text);
  const result: BusImportResult = { buses: [], memberPatches: [], errors: [] };
  if (rows.length < 2) return result;

  const keys = rows[0].map(headerKey);
  const idx = (k: string) => keys.indexOf(k);
  const get = (row: string[], k: string) => { const i = idx(k); return i >= 0 ? (row[i] ?? '').trim() : ''; };

  const membersByPhone = new Map(existingMembers
    .filter((m) => normalizePhone(m.phone))
    .map((m) => [normalizePhone(m.phone), m] as const));
  const membersByEmail = new Map(existingMembers
    .filter((m) => m.email?.trim())
    .map((m) => [m.email.trim().toLowerCase(), m] as const));
  const stamp = now.getTime();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const line = r + 1;
    const name = get(row, 'name');
    const commune = get(row, 'commune');
    const zone = get(row, 'zone');
    const latRaw = get(row, 'centerLat');
    const lngRaw = get(row, 'centerLng');
    const responsablePhone = get(row, 'responsablePhone');
    const responsableEmail = get(row, 'responsableEmail').toLowerCase();

    if (!name || !commune || !zone || !latRaw || !lngRaw || (!responsablePhone && !responsableEmail)) {
      result.errors.push({ line, reason: 'Nom, Commune, Zone, Latitude, Longitude et ResponsableTelephone ou ResponsableEmail obligatoires' });
      continue;
    }
    const centerLat = Number(latRaw);
    const centerLng = Number(lngRaw);
    if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) {
      result.errors.push({ line, reason: 'Latitude/Longitude invalides' });
      continue;
    }
    const memberByPhone = responsablePhone ? membersByPhone.get(normalizePhone(responsablePhone)) : undefined;
    const memberByEmail = responsableEmail ? membersByEmail.get(responsableEmail) : undefined;
    if (memberByPhone && memberByEmail && memberByPhone.id !== memberByEmail.id) {
      result.errors.push({ line, reason: 'ResponsableTelephone et ResponsableEmail correspondent à deux membres différents' });
      continue;
    }
    const member = memberByPhone ?? memberByEmail;
    if (!member) {
      const identifiant = [responsablePhone, responsableEmail].filter(Boolean).join(' / ');
      result.errors.push({ line, reason: `Aucun membre existant avec ce téléphone ou cet email (${identifiant})` });
      continue;
    }

    const requestedBranch = norm(get(row, 'branch'));
    if (!isBusBranch(member.branch) || (requestedBranch && requestedBranch !== member.branch)
      || (activeBranch && activeBranch !== 'global' && activeBranch !== member.branch)) {
      result.errors.push({ line, reason: 'La branche du bus, du responsable et de la vue sélectionnée doit être identique (church ou light)' });
      continue;
    }

    const fonctionRaw = norm(get(row, 'fonction')) as DeptFunction;
    const fonction = BUS_FUNCTIONS.includes(fonctionRaw) ? fonctionRaw : 'responsable';

    const busId = `bus_import_${stamp}_${r}`;

    result.buses.push({ id: busId, name, commune, zone, centerLat, centerLng, branch: member.branch });
    result.memberPatches.push(
      TERRITORIAL.includes(fonction as BusRole)
        ? { ...member, bloomBusId: busId, busRole: fonction as BusRole }
        : { ...member, bloomBusId: busId, departments: { ...member.departments, [BUS_DEPT_ID]: fonction } },
    );
  }
  return result;
}
