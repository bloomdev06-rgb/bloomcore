// Import CSV de Bloom Bus — crée les bus ET assigne un responsable (membre existant) en
// une passe. Un bus n'a pas de champ responsable en base (BusLineSchema) : le lien vit
// sur le Member (departments.dept_bloom_bus + bloomBusId), d'où les deux listes en sortie.
// ponytail: petit parser dédié plutôt que factoriser avec csvImport.ts pour un 2e appelant.
import { BloomBusEntity, Member, DeptFunction, BusRole } from '../types';
import { parseCsv } from './csvImport';

const BUS_DEPT_ID = 'dept_bloom_bus';
const BUS_FUNCTIONS: DeptFunction[] = ['responsable', 'capitaine', 'responsable_zone', 'responsable_commune'];
// §27 — capitaine/responsable_zone/responsable_commune sont des fonctions du MODULE (busRole),
// pas du département : le serveur rejette désormais ce vocabulaire dans `departments` (400).
const TERRITORIAL: BusRole[] = ['capitaine', 'responsable_zone', 'responsable_commune'];

const stripDiacritics = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s: string) => stripDiacritics((s ?? '').trim().toLowerCase());

function headerKey(h: string): string {
  const n = norm(h);
  if (['nom', 'name'].includes(n)) return 'name';
  if (['commune', 'ville'].includes(n)) return 'commune';
  if (['zone'].includes(n)) return 'zone';
  if (['latitude', 'lat'].includes(n)) return 'centerLat';
  if (['longitude', 'lng', 'lon'].includes(n)) return 'centerLng';
  if (['responsabletelephone', 'telephone responsable', 'telephone', 'tel'].includes(n)) return 'responsablePhone';
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
): BusImportResult {
  const rows = parseCsv(text);
  const result: BusImportResult = { buses: [], memberPatches: [], errors: [] };
  if (rows.length < 2) return result;

  const keys = rows[0].map(headerKey);
  const idx = (k: string) => keys.indexOf(k);
  const get = (row: string[], k: string) => { const i = idx(k); return i >= 0 ? (row[i] ?? '').trim() : ''; };

  const membersByPhone = new Map(existingMembers.map(m => [m.phone, m] as const));
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

    if (!name || !commune || !zone || !latRaw || !lngRaw || !responsablePhone) {
      result.errors.push({ line, reason: 'Nom, Commune, Zone, Latitude, Longitude et ResponsableTelephone obligatoires' });
      continue;
    }
    const centerLat = Number(latRaw);
    const centerLng = Number(lngRaw);
    if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) {
      result.errors.push({ line, reason: 'Latitude/Longitude invalides' });
      continue;
    }
    const member = membersByPhone.get(responsablePhone);
    if (!member) {
      result.errors.push({ line, reason: `Aucun membre existant avec ce téléphone (${responsablePhone})` });
      continue;
    }

    const fonctionRaw = norm(get(row, 'fonction')) as DeptFunction;
    const fonction = BUS_FUNCTIONS.includes(fonctionRaw) ? fonctionRaw : 'responsable';

    const busId = `bus_import_${stamp}_${r}`;

    result.buses.push({ id: busId, name, commune, zone, centerLat, centerLng });
    result.memberPatches.push(
      TERRITORIAL.includes(fonction as BusRole)
        ? { ...member, bloomBusId: busId, busRole: fonction as BusRole }
        : { ...member, bloomBusId: busId, departments: { ...member.departments, [BUS_DEPT_ID]: fonction } },
    );
  }
  return result;
}
