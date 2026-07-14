// Jeu de données de TEST Bloom Bus — GÉNÉRATION PURE (aucun accès DB, aucun effet de bord).
// Utilisé par server/seed.ts (baké au seed, gardé par SEED_TEST_PROFILES) et
// server/seed-test-dataset.ts (exécution manuelle).
//
// ≥200 membres, chacun rattaché à UN SEUL Bloom Bus (bloomBusId scalaire) → aucun chevauchement.
// Hiérarchie Département → Communes → Zones → Bloom Bus, chaque entité a son responsable.
// Ministres (avec comptes de connexion), cursus pastoral jusqu'à Pasteur, Nouveaux variés,
// rapports S-1/S-2 aux 3 statuts, activités, membres « Origine Bloom Bus » en attente, GPS.
// Tout est préfixé `stds_` + nom "(TEST)" pour un nettoyage manuel facile.
import type {
  Member, Report, Ministry, Department, BloomBusEntity, CommunityLevel, DeptFunction, PastoralCursus,
} from '../src/types.ts';

export const STDS_PREFIX = 'stds_';

// ---- Semaines S-1 / S-2 (miroir de src/data/week.ts) ----
function mondayISO(d: Date): string {
  const m = new Date(d);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-${String(m.getDate()).padStart(2, '0')}`;
}
const weekOffset = (iso: string, n: number) => {
  const [y, mo, da] = iso.split('-').map(Number);
  return mondayISO(new Date(y, mo - 1, da + n * 7));
};

// Mises à jour de cohérence des comptes test existants (mutation en place).
export function patchTestProfiles(members: Member[], ministries: Ministry[]): void {
  const t6 = members.find((m) => m.id === 'mem_test_6');
  if (t6) { t6.departments = { dept_bloom_bus: 'Responsable' as DeptFunction }; t6.gps = { lat: 5.3854, lng: -3.9781, commune: 'Cocody' }; }
  const t10 = members.find((m) => m.id === 'mem_test_10');
  if (t10) t10.gps = { lat: 5.3436, lng: -4.0722, commune: 'Yopougon' };
  const minExp = ministries.find((m) => m.id === 'min_expansion');
  if (minExp) minExp.tuteurId = 'mem_test_5';
}

const FIRST = ['Awa', 'Koffi', 'Adjoua', 'Yao', 'Aya', 'Kouadio', 'Mariam', 'Ibrahim', 'Fatou', 'Seydou', 'Aicha', 'Moussa', 'Rokia', 'Bakary', 'Nafi', 'Drissa', 'Salif', 'Kadi', 'Oumar', 'Bintou', 'Sekou', 'Ramata', 'Vamara', 'Assita', 'Idrissa', 'Mariama', 'Amadou', 'Djeneba', 'Lassina', 'Fanta'];
const LAST = ['Koné', 'Traoré', 'Ouattara', 'Diallo', 'Bamba', 'Cissé', 'Touré', 'Coulibaly', 'Fofana', 'Sanogo', 'Kouassi', 'Yao', 'Doumbia', 'Sylla', 'Camara'];
const CULTES = ['1er culte Bloom Church', '2e culte Bloom Church', 'Culte Bloom Light'];

// Nouveaux Bloom Bus (test) — enrichit la hiérarchie (plusieurs bus/zone, 6 communes/zones).
const NEW_BUSES: BloomBusEntity[] = [
  { id: 'stds_bus_yop_selmer', name: 'Yopougon Selmer (TEST)', commune: 'Yopougon', zone: 'Zone Ouest', centerLat: 5.3389, centerLng: -4.0810 },
  { id: 'stds_bus_coc_2plateaux', name: 'Cocody 2 Plateaux (TEST)', commune: 'Cocody', zone: 'Zone Est', centerLat: 5.3720, centerLng: -3.9990 },
  { id: 'stds_bus_abo_avocatier', name: 'Abobo Avocatier (TEST)', commune: 'Abobo', zone: 'Zone Nord', centerLat: 5.4300, centerLng: -4.0250 },
  { id: 'stds_bus_kou_remblais', name: 'Koumassi Remblais (TEST)', commune: 'Koumassi', zone: 'Zone Sud', centerLat: 5.2980, centerLng: -3.9400 },
  { id: 'stds_bus_mar_zone4', name: 'Marcory Zone 4 (TEST)', commune: 'Marcory', zone: 'Zone Sud-Est', centerLat: 5.2840, centerLng: -3.9880 },
  { id: 'stds_bus_mar_biafra', name: 'Marcory Biafra (TEST)', commune: 'Marcory', zone: 'Zone Sud-Est', centerLat: 5.2900, centerLng: -3.9950 },
  { id: 'stds_bus_tre_arras', name: 'Treichville Arras (TEST)', commune: 'Treichville', zone: 'Zone Centre', centerLat: 5.2950, centerLng: -4.0090 },
  { id: 'stds_bus_tre_apollo', name: 'Treichville Apollo (TEST)', commune: 'Treichville', zone: 'Zone Centre', centerLat: 5.3010, centerLng: -4.0150 },
];

// Capitaines réutilisés (profils test) ; les autres sont générés.
const CAPTAIN_REUSE: Record<string, string> = { bus_yop_maroc: 'mem_test_10' };
// Buses « complets » (tous rapports validés) pour tester la complétude à 100 %.
const COMPLETE_BUS = new Set(['bus_coc_angre', 'stds_bus_coc_2plateaux', 'bus_kou_sogefiha']);

const PASTORAL: PastoralCursus[] = ['Appelé', 'Serviteur', "Gagneur d'âme", 'Assistant Pasteur', 'Pasteur Assistant', 'Pasteur Titulaire'];
const INTEG_STATE = ['En attente', 'Suivi', 'Intégré'] as const;
const INTEG_FOLLOW = ['Non suivi', 'En attente', 'En cours', 'À recontacter', 'Intégré', 'Non intégré'] as const;

export interface TestDataset {
  members: Member[];
  reports: Report[];
  newBuses: BloomBusEntity[];
  ministryTuteurs: { ministryId: string; memberId: string }[];
  credentialMemberIds: string[]; // membres nécessitant un compte de connexion (ministres)
}

export function buildTestDataset(departments: Department[], existingBusLines: BloomBusEntity[], baseMembers: Member[]): TestDataset {
  const CUR = mondayISO(new Date());
  const S1 = weekOffset(CUR, -1);
  const S2 = weekOffset(CUR, -2);
  const TODAY = new Date().toISOString().split('T')[0];

  const allBuses = [...existingBusLines, ...NEW_BUSES];
  const busById = new Map(allBuses.map((b) => [b.id, b]));
  // commune → zone (première rencontrée), commune → 1er bus, zone → 1er bus
  const firstBusOfCommune = new Map<string, BloomBusEntity>();
  const firstBusOfZone = new Map<string, BloomBusEntity>();
  const zoneOfCommune = new Map<string, string>();
  for (const b of allBuses) {
    if (!firstBusOfCommune.has(b.commune)) firstBusOfCommune.set(b.commune, b);
    if (!firstBusOfZone.has(b.zone)) firstBusOfZone.set(b.zone, b);
    if (!zoneOfCommune.has(b.commune)) zoneOfCommune.set(b.commune, b.zone);
  }
  const communes = [...firstBusOfCommune.keys()];
  const zones = [...firstBusOfZone.keys()];

  const members: Member[] = [];
  const reports: Report[] = [];
  const ministryTuteurs: { ministryId: string; memberId: string }[] = [];
  const credentialMemberIds: string[] = [];
  let regPhone = 1;   // +2250599… (sans login)
  let minPhone = 1;   // +2250598… (ministres, avec login)
  let nameN = 0;

  const jitter = (base: number, i: number) => +(base + ((i % 7) - 3) * 0.0025).toFixed(5);

  const mkMember = (id: string, extra: Partial<Member>, login = false): Member => {
    const i = nameN++;
    const phone = login ? `+2250598${String(minPhone++).padStart(6, '0')}` : `+2250599${String(regPhone++).padStart(6, '0')}`;
    return {
      id,
      firstName: FIRST[i % FIRST.length],
      lastName: `${LAST[i % LAST.length]} (TEST)`,
      phone,
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
    const author = validated ? { id: capId, name: capName, role: 'Capitaine de Bus' } : { id: m.id, name: `${m.firstName} ${m.lastName}`, role: 'Membre' };
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

  // -------- 1) Responsable de Département (Bloom Bus) : mem_test_6 (réutilisé, patché) --------

  // -------- 2) Responsables de Zone (1 par zone ; Zone Est = mem_test_11 réutilisé) --------
  const zoneLead: Record<string, string> = { 'Zone Est': 'mem_test_11' };
  for (const zone of zones) {
    if (zoneLead[zone]) continue;
    const b = firstBusOfZone.get(zone)!;
    const m = mkMember(`stds_zone_${b.id}`, {
      departments: { dept_bloom_bus: 'Responsable de Zone' as DeptFunction }, bloomBusId: b.id, level: 'Leader',
      gps: { lat: b.centerLat, lng: b.centerLng, commune: b.commune },
    });
    members.push(m); zoneLead[zone] = m.id;
  }

  // -------- 3) Ministres (avec login), dont 2 responsables de commune --------
  const FREE_MINISTRIES = ['min_intimite', 'min_art', 'min_coordination', 'min_affermissement'];
  const communeLead: Record<string, string> = { Cocody: 'mem_test_12' };
  const ministreCommuneOf: Record<number, string> = { 0: 'Yopougon', 1: 'Marcory' }; // ministres 0 & 1 = resp. commune
  for (let k = 0; k < 4; k++) {
    const commune = ministreCommuneOf[k];
    const extra: Partial<Member> = { level: 'Coach', pastoralCursus: k === 3 ? 'Serviteur' : 'Aucun' };
    if (commune) {
      const b = firstBusOfCommune.get(commune)!;
      extra.departments = { dept_bloom_bus: 'Responsable de Commune' as DeptFunction };
      extra.bloomBusId = b.id;
      extra.gps = { lat: b.centerLat, lng: b.centerLng, commune };
    } else {
      extra.gps = { lat: 5.35, lng: -4.0, commune: 'Cocody' };
    }
    const m = mkMember(`stds_ministre_${k}`, extra, true);
    members.push(m);
    credentialMemberIds.push(m.id);
    ministryTuteurs.push({ ministryId: FREE_MINISTRIES[k], memberId: m.id });
    if (commune) communeLead[commune] = m.id;
  }

  // -------- Responsables de Commune restants (générés) --------
  for (const commune of communes) {
    if (communeLead[commune]) continue;
    const b = firstBusOfCommune.get(commune)!;
    const m = mkMember(`stds_commune_${b.commune.toLowerCase()}`, {
      departments: { dept_bloom_bus: 'Responsable de Commune' as DeptFunction }, bloomBusId: b.id, level: 'Coach',
      gps: { lat: b.centerLat, lng: b.centerLng, commune },
    });
    members.push(m); communeLead[commune] = m.id;
  }

  // -------- 1bis) Membres par bus (12/bus) + capitaine + rapports --------
  const PATTERN = [
    { s2: 'none', s1: 'none' }, { s2: 'none', s1: 'pending' }, { s2: 'pending', s1: 'validated' },
    { s2: 'validated', s1: 'validated' }, { s2: 'validated', s1: 'pending' }, { s2: 'pending', s1: 'none' },
  ] as const;
  const MEMBER_LEVELS: CommunityLevel[] = ['Stagiaire', 'Boss', 'Leader', 'Coach']; // pas 'Nouveau' (exclu des bus)

  for (const bus of allBuses) {
    // Capitaine
    let capId = CAPTAIN_REUSE[bus.id];
    let capName: string;
    if (capId) {
      const c = baseMembers.find((m) => m.id === capId);
      capName = c ? `${c.firstName} ${c.lastName}` : 'Capitaine';
    } else {
      const cap = mkMember(`stds_cap_${bus.id}`, {
        departments: { dept_bloom_bus: 'Capitaine de Bus' as DeptFunction }, bloomBusId: bus.id, level: 'Coach',
        gps: { lat: jitter(bus.centerLat, 0), lng: jitter(bus.centerLng, 0), commune: bus.commune },
      });
      members.push(cap); capId = cap.id; capName = `${cap.firstName} ${cap.lastName}`;
    }
    // 12 membres du bus (distincts, un seul bloomBusId)
    for (let i = 0; i < 12; i++) {
      const m = mkMember(`stds_m_${bus.id}_${i}`, {
        bloomBusId: bus.id, departments: { dept_bloom_bus: 'Membre' as DeptFunction }, level: MEMBER_LEVELS[i % MEMBER_LEVELS.length],
        gps: { lat: jitter(bus.centerLat, i + 1), lng: jitter(bus.centerLng, i + 1), commune: bus.commune },
        healthKPIs: { spirituel: 2 + (i % 4), social: 3, financier: 2 + (i % 3), physique: 3, presenceCulte: 2 + (i % 4), presenceService: 3 },
      });
      members.push(m);
      const pat = COMPLETE_BUS.has(bus.id) ? { s2: 'validated', s1: 'validated' } as const : PATTERN[i % PATTERN.length];
      if (pat.s2 !== 'none') pushHealth(m, S2, pat.s2 === 'validated', capId, capName, i);
      if (pat.s1 !== 'none') pushHealth(m, S1, pat.s1 === 'validated', capId, capName, i + 1);
    }
    // Rapport d'activité pour 1 bus sur 3
    if ((allBuses.indexOf(bus)) % 3 === 0) {
      reports.push({
        id: `stds_repact_${bus.id}`, authorId: capId, authorName: capName, authorRole: 'Capitaine de Bus',
        targetBranch: 'church', date: TODAY, reportType: 'rapport_bloom_bus_life', confidential: false,
        content: { busId: bus.id, activityName: 'Évangélisation de quartier', activityDay: 'Samedi', description: `Sortie ${bus.name}`, observation: undefined, presenceList: [], soulsWon: 2 + (allBuses.indexOf(bus) % 4) },
      } as Report);
    }
  }

  // -------- 3bis) Cursus pastoral (jusqu'à Pasteur) --------
  for (let k = 0; k < PASTORAL.length; k++) {
    members.push(mkMember(`stds_pastoral_${k}`, {
      pastoralCursus: PASTORAL[k], level: 'Coach', departments: { dept_mres: 'Membre' as DeptFunction },
      gps: { lat: 5.36 + k * 0.005, lng: -3.99, commune: 'Cocody' },
    }));
  }

  // -------- 4) Nouveaux à divers stades d'intégration --------
  for (let k = 0; k < 15; k++) {
    members.push(mkMember(`stds_nouveau_${k}`, {
      level: 'Nouveau', hasPassedToBossForm: false, baptismStatus: 'Non baptisé',
      departments: { dept_adn: 'Membre' as DeptFunction },
      integrationState: INTEG_STATE[k % INTEG_STATE.length],
      integrationFollowStatus: INTEG_FOLLOW[k % INTEG_FOLLOW.length],
      integrationDateRegistered: weekOffset(CUR, -(k % 6)),
      membershipWish: k % 3 === 0 ? 'Visiteur' : 'Membre',
      receptionValidated: k % 2 === 0,
      gps: { lat: 5.34 + (k % 5) * 0.01, lng: -4.01 + (k % 4) * 0.01, commune: communes[k % communes.length] },
    }));
  }

  // -------- Membres dans CHAQUE autre département (couverture) --------
  let di = 0;
  for (const d of departments) {
    if (d.specialFunction === 'bloom_bus') continue;
    for (let j = 0; j < 1 + (di % 2); j++) { // 1 ou 2 par dept
      members.push(mkMember(`stds_dept_${d.id}_${j}`, {
        departments: { [d.id]: (j === 0 ? 'Membre' : 'Adjoint') as DeptFunction },
        level: MEMBER_LEVELS[(di + j) % MEMBER_LEVELS.length],
        gps: { lat: 5.35 + (di % 7) * 0.008, lng: -4.0 + (di % 5) * 0.008, commune: communes[di % communes.length] },
      }));
    }
    di++;
  }

  // -------- 7) Membres « Origine : Bloom Bus » en attente (Réception à valider) --------
  const pendingBuses = ['bus_coc_angre', 'bus_yop_maroc', 'stds_bus_mar_zone4', 'bus_abo_gendarmerie'];
  for (let i = 0; i < pendingBuses.length; i++) {
    const b = busById.get(pendingBuses[i])!;
    members.push(mkMember(`stds_pending_${i}`, {
      departments: { dept_bloom_bus: 'Membre' as DeptFunction }, bloomBusId: b.id, level: 'Stagiaire',
      deptAttachmentStatus: 'pending', deptAttachmentOrigin: 'bloom_bus',
      gps: { lat: jitter(b.centerLat, i), lng: jitter(b.centerLng, i), commune: b.commune },
    }));
  }

  return { members, reports, newBuses: NEW_BUSES, ministryTuteurs, credentialMemberIds };
}
