// M5 — convergence des valeurs stockées vers le snake_case FR d'ARCHITECTURE_TECHNIQUE.md §3.
// Maps ANCIEN→NOUVEAU bijectives + `canonicalize(collection, item)` pur, partagé front/back.
// Installé à 2 boundaries (serveur applyWrite + sweep client au boot) pour que l'ordre de
// déploiement soit indifférent : même un vieux client qui envoie d'anciennes valeurs les voit
// normalisées à l'arrivée → impossible de réintroduire l'ancien par-dessus le migré (LWW).
//
// Périmètre (décidé) : level, integrationState, pastoralCursus, baptismStatus, fonction de
// département (snake_case en gardant le sur-ensemble réel), department.type, statut de tâche
// projet, project.scope (+ nouveau champ project.branch), champ rapport_adn. Rôles et chaînes
// de capacités NON migrés (couche dérivée / cosmétique — cf. M5-PLAN.md §3.4/§3.5).

export const LEVEL_MAP: Record<string, string> = {
  Nouveau: 'nouveau', Stagiaire: 'stagiaire', Boss: 'boss', Leader: 'leader', Coach: 'coach',
};
export const INTEGRATION_STATE_MAP: Record<string, string> = {
  'En attente': 'en_attente', Suivi: 'suivi', 'Intégré': 'integre',
};
export const CURSUS_MAP: Record<string, string> = {
  Aucun: 'aucun', 'Appelé': 'appele', Serviteur: 'serviteur', "Gagneur d'âme": 'gagneur_ame',
  'Assistant Pasteur': 'assistant_pasteur', 'Pasteur Assistant': 'pasteur_assistant',
  'Pasteur Titulaire': 'pasteur_titulaire',
};
export const BAPTISM_MAP: Record<string, string> = {
  'Non baptisé': 'non_baptise', 'Baptisé': 'baptise',
};
export const DEPT_FN_MAP: Record<string, string> = {
  Responsable: 'responsable', Adjoint: 'adjoint', 'Trésorier': 'tresorier',
  'Responsable de section': 'responsable_section', Membre: 'membre',
  'Capitaine de Bus': 'capitaine', 'Responsable de Zone': 'responsable_zone',
  'Responsable de Commune': 'responsable_commune',
};
export const DEPT_TYPE_MAP: Record<string, string> = { service: 'normal', 'spécial': 'special' };
export const TASK_STATUS_MAP: Record<string, string> = { todo: 'a_faire', doing: 'en_cours', done: 'fait' };
// project.scope : church/light → branche (+ project.branch), both → transverse, ministry → ministere.
export const PROJECT_SCOPE_MAP: Record<string, string> = {
  church: 'branche', light: 'branche', both: 'transverse', ministry: 'ministere',
};
export const ADN_FIELD_MAP: Record<string, string> = {
  nouveauxHommes: 'nouveauxH', nouveauxFemmes: 'nouveauxF', ojHommes: 'ojH', ojFemmes: 'ojF',
};

// Applique une map si la valeur y est, sinon la laisse telle quelle (idempotent : une valeur
// déjà migrée n'est pas une clé → renvoyée inchangée).
function map(m: Record<string, string>, v: unknown): unknown {
  return typeof v === 'string' && v in m ? m[v] : v;
}

// Libellés d'affichage (NOUVEAU → texte UI). Les valeurs nouvelles sont globalement uniques,
// donc une seule map plate suffit. `labelFor(v)` retombe sur v si absent (id, valeur libre…).
export const LABELS: Record<string, string> = {
  nouveau: 'Nouveau', stagiaire: 'Stagiaire', boss: 'Boss', leader: 'Leader', coach: 'Coach',
  en_attente: 'En attente', suivi: 'Suivi', integre: 'Intégré',
  aucun: 'Aucun', appele: 'Appelé', serviteur: 'Serviteur', gagneur_ame: "Gagneur d'âme",
  assistant_pasteur: 'Assistant Pasteur', pasteur_assistant: 'Pasteur Assistant',
  pasteur_titulaire: 'Pasteur Titulaire',
  non_baptise: 'Non baptisé', baptise: 'Baptisé',
  responsable: 'Responsable', adjoint: 'Adjoint', tresorier: 'Trésorier',
  responsable_section: 'Responsable de section', membre: 'Membre', capitaine: 'Capitaine de Bus',
  responsable_zone: 'Responsable de Zone', responsable_commune: 'Responsable de Commune',
  normal: 'Normal', special: 'Spécial',
  a_faire: 'À faire', en_cours: 'En cours', fait: 'Fait',
  transverse: 'Transverse', branche: 'Branche', ministere: 'Ministère',
};
export function labelFor(value: unknown): string {
  return typeof value === 'string' ? (LABELS[value] ?? value) : '';
}

// NOUVELLE valeur (fonction dept ou level) → nom de rôle stable (= ancienne valeur capitalisée).
// Le vocabulaire de rôles (matrice, rbac, scope) reste inchangé : on remappe seulement au
// moment de dériver les rôles depuis un membre migré. Cf. M5-PLAN.md §3.4.
const INV_DEPT_FN: Record<string, string> = Object.fromEntries(Object.entries(DEPT_FN_MAP).map(([o, n]) => [n, o]));
const INV_LEVEL: Record<string, string> = Object.fromEntries(Object.entries(LEVEL_MAP).map(([o, n]) => [n, o]));
export function roleForDeptFn(fn: unknown): string {
  return typeof fn === 'string' ? (INV_DEPT_FN[fn] ?? fn) : String(fn);
}
export function roleForLevel(level: unknown): string {
  return typeof level === 'string' ? (INV_LEVEL[level] ?? level) : String(level);
}

// Canonicalise UN item selon sa collection. Pur (renvoie un nouvel objet), idempotent.
export function canonicalize(collection: string, item: any): any {
  if (!item || typeof item !== 'object') return item;
  switch (collection) {
    case 'members': {
      const departments = item.departments && typeof item.departments === 'object'
        ? Object.fromEntries(Object.entries(item.departments).map(([k, v]) => [k, map(DEPT_FN_MAP, v)]))
        : item.departments;
      return {
        ...item,
        level: map(LEVEL_MAP, item.level),
        integrationState: map(INTEGRATION_STATE_MAP, item.integrationState),
        pastoralCursus: map(CURSUS_MAP, item.pastoralCursus),
        baptismStatus: map(BAPTISM_MAP, item.baptismStatus),
        departments,
      };
    }
    case 'departments':
      return { ...item, type: map(DEPT_TYPE_MAP, item.type) };
    case 'projects': {
      const next: any = { ...item, scope: map(PROJECT_SCOPE_MAP, item.scope) };
      // church/light portaient l'identité de branche dans le scope → la préserver dans .branch.
      if (item.scope === 'church' || item.scope === 'light') next.branch = item.branch ?? item.scope;
      if (Array.isArray(item.actions)) next.actions = item.actions.map((a: any) => (a && typeof a === 'object' ? { ...a, status: map(TASK_STATUS_MAP, a.status) } : a));
      return next;
    }
    case 'reports': {
      if (item.reportType !== 'rapport_adn' || !item.content || typeof item.content !== 'object') return item;
      const content: any = { ...item.content };
      for (const [oldK, newK] of Object.entries(ADN_FIELD_MAP)) {
        if (oldK in content && !(newK in content)) { content[newK] = content[oldK]; delete content[oldK]; }
      }
      return { ...item, content };
    }
    case 'capability_overrides': {
      const m = item.subjectType === 'level' ? LEVEL_MAP : item.subjectType === 'cursus' ? CURSUS_MAP : item.subjectType === 'function' ? DEPT_FN_MAP : null;
      return m ? { ...item, subjectValue: map(m, item.subjectValue) } : item;
    }
    default:
      return item;
  }
}
