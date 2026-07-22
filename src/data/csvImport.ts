// Import CSV de membres — miroir de l'export (MembersView.downloadCsv). Parser maison
// (pas de papaparse : YAGNI) gérant guillemets, délimiteur `,` ou `;`, CRLF et BOM.
// Validation dure : prénom + nom + téléphone requis, pas de doublon téléphone (existant
// OU dans le lot). Enums (branche/niveau/cursus/baptême) : tolérants, repli sur défaut.
import { Member, Branch, CommunityLevel, PastoralCursus } from '../types';

// ponytail: parser d'un seul passage — gère "" échappé et le délimiteur détecté sur l'en-tête.
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip BOM
  // délimiteur : `;` s'il apparaît avant la 1re virgule sur la 1re ligne (export Excel-FR)
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const delim = firstLine.includes(';') && (!firstLine.includes(',') || firstLine.indexOf(';') < firstLine.indexOf(',')) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } // "" → "
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip, \n closes the row */ }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim() !== '')); // drop blank lines
}

const LEVELS: CommunityLevel[] = ['nouveau', 'stagiaire', 'boss', 'leader', 'coach'];
const CURSUS: PastoralCursus[] = ['aucun', 'appele', 'serviteur', 'gagneur_ame', 'assistant_pasteur', 'pasteur_assistant', 'pasteur_titulaire'];

const stripDiacritics = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s: string) => stripDiacritics((s ?? '').trim().toLowerCase());

// en-têtes → clé canonique (accepte quelques synonymes courants)
function headerKey(h: string): string {
  const n = norm(h);
  if (['nom', 'lastname', 'nom de famille'].includes(n)) return 'lastName';
  if (['prenom', 'firstname'].includes(n)) return 'firstName';
  if (['telephone', 'tel', 'phone', 'numero', 'contact'].includes(n)) return 'phone';
  if (['email', 'mail', 'e-mail', 'courriel'].includes(n)) return 'email';
  if (['branche', 'branch'].includes(n)) return 'branch';
  if (['niveau', 'level'].includes(n)) return 'level';
  if (['cursus', 'cursus pastoral'].includes(n)) return 'pastoralCursus';
  if (['bapteme', 'bapteme statut', 'baptism'].includes(n)) return 'baptismStatus';
  if (['sexe', 'genre', 'gender'].includes(n)) return 'gender';
  if (['commune', 'ville'].includes(n)) return 'commune';
  if (['profession', 'metier'].includes(n)) return 'profession';
  return n;
}

export interface CsvImportResult {
  members: Member[];                       // prêts à passer à onAddMember
  errors: { line: number; reason: string }[]; // lignes rejetées (1-indexé, en-tête = ligne 1)
  total: number;                            // lignes de données lues (hors en-tête)
}

// `now` injecté pour testabilité (entryDate + ids déterministes en test).
export function importMembersFromCsv(
  text: string,
  existingMembers: Member[],
  defaultBranch: Branch = 'church',
  now: Date = new Date(),
): CsvImportResult {
  const rows = parseCsv(text);
  const result: CsvImportResult = { members: [], errors: [], total: 0 };
  if (rows.length < 2) return result; // besoin d'un en-tête + au moins 1 ligne

  const keys = rows[0].map(headerKey);
  const idx = (k: string) => keys.indexOf(k);
  const get = (row: string[], k: string) => { const i = idx(k); return i >= 0 ? (row[i] ?? '').trim() : ''; };

  const existingPhones = new Set(existingMembers.map(m => m.phone));
  const batchPhones = new Set<string>();
  const stamp = now.getTime();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    result.total++;
    const line = r + 1; // 1-indexé humain
    const firstName = get(row, 'firstName');
    const lastName = get(row, 'lastName');
    const phone = get(row, 'phone');
    if (!firstName || !lastName || !phone) {
      result.errors.push({ line, reason: 'Prénom, nom et téléphone obligatoires' });
      continue;
    }
    if (existingPhones.has(phone) || batchPhones.has(phone)) {
      result.errors.push({ line, reason: `Téléphone déjà présent (${phone})` });
      continue;
    }
    batchPhones.add(phone);

    const levelRaw = norm(get(row, 'level')) as CommunityLevel;
    const cursusRaw = norm(get(row, 'pastoralCursus')) as PastoralCursus;
    const branchRaw = norm(get(row, 'branch'));
    const genderRaw = norm(get(row, 'gender'));

    result.members.push({
      id: `mem_import_${stamp}_${r}`,
      firstName,
      lastName,
      phone,
      email: get(row, 'email'),
      gender: genderRaw.startsWith('f') ? 'F' : 'H', // ponytail: défaut H si non renseigné
      birthDate: '',
      maritalStatus: 'Célibataire',
      profession: get(row, 'profession'),
      gps: { lat: 5.3854, lng: -3.9781, commune: get(row, 'commune') || 'Abidjan' },
      entryDate: now.toISOString().split('T')[0],
      branch: branchRaw === 'light' ? 'light' : branchRaw === 'church' ? 'church' : defaultBranch,
      level: LEVELS.includes(levelRaw) ? levelRaw : 'stagiaire',
      pastoralCursus: CURSUS.includes(cursusRaw) ? cursusRaw : 'aucun',
      departments: {},
      baptismStatus: norm(get(row, 'baptismStatus')) === 'baptise' ? 'baptise' : 'non_baptise',
      hasPassedToBossForm: true,
      healthKPIs: { spirituel: 3, social: 3, financier: 3, physique: 4, presenceCulte: 4, presenceService: 3 },
    });
  }
  return result;
}
