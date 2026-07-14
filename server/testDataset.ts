// Jeu de données de TEST Bloom Bus — GÉNÉRATION PURE (aucun accès DB, aucun effet de bord).
// Utilisé par : server/seed.ts (bake au seed, gardé par SEED_TEST_PROFILES) ET
// server/seed-test-dataset.ts (exécution manuelle sur une base live).
//
// Toutes les entités portent l'id préfixe `stds_` et le marqueur de nom "(TEST)" — repérables
// et supprimables. Ids déterministes → idempotent (même sortie à chaque appel).
import type { Member, Report, Ministry, Department, BloomBusEntity, CommunityLevel, DeptFunction } from '../src/types.ts';

export const STDS_PREFIX = 'stds_';

// ---- Semaines S-1 / S-2 (miroir de src/data/week.ts : lundi local, (day+6)%7) ----
function mondayISO(d: Date): string {
  const m = new Date(d);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-${String(m.getDate()).padStart(2, '0')}`;
}
function weekOffset(iso: string, n: number): string {
  const [y, mo, da] = iso.split('-').map(Number);
  return mondayISO(new Date(y, mo - 1, da + n * 7));
}

// Mises à jour de cohérence des comptes test existants (mutation en place des tableaux seed).
// mem_test_6 → Responsable du dept Bloom Bus (valide les réceptions) ; mem_test_10 GPS ;
// min_expansion.tuteurId = mem_test_5 (Ministre réel du ministère contenant Bloom Bus).
export function patchTestProfiles(members: Member[], ministries: Ministry[]): void {
  const t6 = members.find((m) => m.id === 'mem_test_6');
  if (t6) { t6.departments = { dept_bloom_bus: 'Responsable' as DeptFunction }; t6.gps = { lat: 5.3854, lng: -3.9781, commune: 'Cocody' }; }
  const t10 = members.find((m) => m.id === 'mem_test_10');
  if (t10) t10.gps = { lat: 5.3436, lng: -4.0722, commune: 'Yopougon' };
  const minExp = ministries.find((m) => m.id === 'min_expansion');
  if (minExp) minExp.tuteurId = 'mem_test_5';
}

const FIRST = ['Awa', 'Koffi', 'Adjoua', 'Yao', 'Aya', 'Kouadio', 'Mariam', 'Ibrahim', 'Fatou', 'Seydou', 'Aicha', 'Moussa', 'Rokia', 'Bakary', 'Nafi', 'Drissa', 'Salif', 'Kadi', 'Oumar', 'Bintou', 'Sekou', 'Ramata', 'Vamara', 'Assita'];
const LAST = ['Koné', 'Traoré', 'Ouattara', 'Diallo', 'Bamba', 'Cissé', 'Touré', 'Coulibaly', 'Fofana', 'Sanogo', 'Kouassi', 'Yao'];
const LEVELS: CommunityLevel[] = ['Nouveau', 'Stagiaire', 'Boss', 'Leader', 'Coach'];
const CULTES = ['1er culte Bloom Church', '2e culte Bloom Church', 'Culte Bloom Light'];
const CAPTAIN_REUSE: Record<string, string> = { bus_yop_maroc: 'mem_test_10' };
const COMPLETE_BUS = new Set(['bus_coc_angre']); // 100 % validé
const ACTIVITY_BUS = ['bus_coc_angre', 'bus_yop_maroc', 'bus_abo_gendarmerie'];
const PENDING_BUS = ['bus_coc_angre', 'bus_yop_maroc', 'bus_abo_gendarmerie'];
const PATTERN: { s2: 'none' | 'pending' | 'validated'; s1: 'none' | 'pending' | 'validated' }[] = [
  { s2: 'none', s1: 'none' },
  { s2: 'none', s1: 'pending' },
  { s2: 'pending', s1: 'validated' },
  { s2: 'validated', s1: 'validated' },
  { s2: 'validated', s1: 'pending' },
];
const jitter = (base: number, i: number) => +(base + ((i % 5) - 2) * 0.003).toFixed(5);

export function buildTestDataset(
  departments: Department[],
  busLines: BloomBusEntity[],
  baseMembers: Member[],
): { members: Member[]; reports: Report[] } {
  const CUR = mondayISO(new Date());
  const S1 = weekOffset(CUR, -1);
  const S2 = weekOffset(CUR, -2);
  const TODAY = new Date().toISOString().split('T')[0];

  const members: Member[] = [];
  const reports: Report[] = [];
  let phoneN = 1;
  let nameN = 0;

  const mkMember = (id: string, extra: Partial<Member>): Member => {
    const i = nameN++;
    return {
      id,
      firstName: FIRST[i % FIRST.length],
      lastName: `${LAST[i % LAST.length]} (TEST)`,
      phone: `+2250599${String(phoneN++).padStart(6, '0')}`,
      email: `${id}@bloom.test`,
      gender: i % 2 === 0 ? 'H' : 'F',
      birthDate: '1996-03-15',
      maritalStatus: 'Célibataire',
      profession: 'Testeur',
      source: 'seedtest',
      branch: 'church',
      level: 'Boss',
      pastoralCursus: 'Aucun',
      departments: {},
      entryDate: '2025-01-10',
      hasPassedToBossForm: true,
      baptismStatus: 'Baptisé',
      healthKPIs: { spirituel: 3, social: 3, financier: 3, physique: 3, presenceCulte: 3, presenceService: 3 },
      ...extra,
    } as Member;
  };

  const pushHealth = (m: Member, week: string, validated: boolean, capId: string, capName: string, i: number) => {
    const author = validated
      ? { id: capId, name: capName, role: 'Capitaine de Bus' }
      : { id: m.id, name: `${m.firstName} ${m.lastName}`, role: 'Membre' };
    reports.push({
      id: `rep_bus_mem_${m.id}_${week}`,
      authorId: author.id, authorName: author.name, authorRole: author.role,
      targetBranch: 'church', date: TODAY, weekOf: week,
      reportType: 'rapport_bloom_bus_member', confidential: false, validated,
      content: {
        memberId: m.id, memberName: `${m.firstName} ${m.lastName}`,
        sprVal: 2 + (i % 4), socVal: 2 + ((i + 1) % 4), finVal: 2 + ((i + 2) % 4), phyVal: 2 + ((i + 3) % 4),
        culte: CULTES[i % CULTES.length], observation: `Rapport de test ${week}`,
      },
    } as Report);
  };

  // A) Un membre dans CHAQUE département (hors bloom_bus, couvert par la hiérarchie).
  let di = 0;
  for (const d of departments) {
    if (d.specialFunction === 'bloom_bus') continue;
    members.push(mkMember(`stds_dept_${d.id}`, {
      departments: { [d.id]: 'Membre' as DeptFunction },
      level: LEVELS[di % LEVELS.length],
      gps: { lat: 5.35 + (di % 7) * 0.01, lng: -4.0 + (di % 5) * 0.01, commune: 'Cocody' },
      healthKPIs: { spirituel: 2 + (di % 4), social: 2 + (di % 3), financier: 3, physique: 3, presenceCulte: 2 + (di % 4), presenceService: 3 },
    }));
    di++;
  }

  // B) Hiérarchie Bloom Bus — leads générés (Zone Ouest / Commune Yopougon ; Zone Est/Commune Cocody = mem_test_11/12).
  members.push(mkMember('stds_lead_zone_ouest', {
    departments: { dept_bloom_bus: 'Responsable de Zone' as DeptFunction }, bloomBusId: 'bus_yop_maroc',
    gps: { lat: 5.3436, lng: -4.0722, commune: 'Yopougon' }, level: 'Leader',
  }));
  members.push(mkMember('stds_lead_commune_yop', {
    departments: { dept_bloom_bus: 'Responsable de Commune' as DeptFunction }, bloomBusId: 'bus_yop_maroc',
    gps: { lat: 5.3436, lng: -4.0722, commune: 'Yopougon' }, level: 'Coach',
  }));

  for (const bus of busLines) {
    const commune = bus.commune;
    let capId = CAPTAIN_REUSE[bus.id];
    let capName: string;
    if (capId) {
      const c = baseMembers.find((m) => m.id === capId);
      capName = c ? `${c.firstName} ${c.lastName}` : 'Capitaine';
    } else {
      const cap = mkMember(`stds_cap_${bus.id}`, {
        departments: { dept_bloom_bus: 'Capitaine de Bus' as DeptFunction }, bloomBusId: bus.id,
        gps: { lat: jitter(bus.centerLat, 0), lng: jitter(bus.centerLng, 0), commune }, level: 'Coach',
      });
      members.push(cap); capId = cap.id; capName = `${cap.firstName} ${cap.lastName}`;
    }

    const busMemberIds: string[] = [];
    const nMembers = COMPLETE_BUS.has(bus.id) ? 4 : 5;
    for (let i = 0; i < nMembers; i++) {
      const m = mkMember(`stds_m_${bus.id}_${i}`, {
        bloomBusId: bus.id, level: LEVELS[i % LEVELS.length],
        gps: { lat: jitter(bus.centerLat, i + 1), lng: jitter(bus.centerLng, i + 1), commune },
        healthKPIs: { spirituel: 2 + (i % 4), social: 3, financier: 2 + (i % 3), physique: 3, presenceCulte: 2 + (i % 4), presenceService: 3 },
      });
      members.push(m); busMemberIds.push(m.id);
      const pat = COMPLETE_BUS.has(bus.id) ? ({ s2: 'validated', s1: 'validated' } as const) : PATTERN[i % PATTERN.length];
      if (pat.s2 !== 'none') pushHealth(m, S2, pat.s2 === 'validated', capId, capName, i);
      if (pat.s1 !== 'none') pushHealth(m, S1, pat.s1 === 'validated', capId, capName, i + 1);
    }

    if (ACTIVITY_BUS.includes(bus.id)) {
      reports.push({
        id: `stds_repact_${bus.id}`,
        authorId: capId, authorName: capName, authorRole: 'Capitaine de Bus',
        targetBranch: 'church', date: TODAY, reportType: 'rapport_bloom_bus_life', confidential: false,
        content: {
          busId: bus.id, activityName: 'Évangélisation de quartier', activityDay: 'Samedi',
          description: `Sortie Bloom Bus ${bus.name} (test)`, observation: undefined,
          presenceList: busMemberIds.slice(0, 3), soulsWon: 2 + (busMemberIds.length % 4),
        },
      } as Report);
    }
  }

  // C) Membres en attente « Origine : Bloom Bus » (onglet Intégration du Responsable dept).
  for (let i = 0; i < PENDING_BUS.length; i++) {
    const bl = busLines.find((b) => b.id === PENDING_BUS[i])!;
    members.push(mkMember(`stds_pending_${i}`, {
      departments: { dept_bloom_bus: 'Membre' as DeptFunction }, bloomBusId: PENDING_BUS[i],
      level: 'Stagiaire', deptAttachmentStatus: 'pending', deptAttachmentOrigin: 'bloom_bus',
      gps: { lat: jitter(bl.centerLat, i), lng: jitter(bl.centerLng, i), commune: bl.commune },
    }));
  }

  return { members, reports };
}
