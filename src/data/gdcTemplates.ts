// Fiches de rapport GDC spécifiques par événement ET par branche (lot 4).
// Contenu exact fourni par le commanditaire pour Super Sunday / Bloom Sunday / Speak Out
// (Church) ; les fiches Light (Light Sunday / Light Show / Super Sunday Light) dupliquent
// ces structures (validé) en attendant leurs propres modèles. Les autres événements
// utilisent la fiche de rapport général (4 blocs) de CulteReportView.
import type { Event } from '../types';

export interface GdcField {
  key: string;
  label: string;
  type?: 'text' | 'textarea' | 'number' | 'date';
}
export interface GdcSection { title: string; fields: GdcField[]; }
export interface GdcTemplate { id: string; title: string; sections: GdcSection[]; }

const f = (key: string, label: string, type: GdcField['type'] = 'text'): GdcField => ({ key, label, type });

// Sections communes à toutes les fiches spécifiques.
const MESSAGE = (label: string): GdcSection => ({ title: label, fields: [f('message', 'Thème, références & bref résumé', 'textarea')] });
// EFFECTIFS — OJ / Total Nouveaux / F / G pré-remplis depuis le rapport ADN de l'événement.
const EFFECTIFS: GdcSection = {
  title: 'EFFECTIFS',
  fields: [
    f('oj', 'OJ', 'number'),
    f('totalNouveaux', 'Total Nouveaux', 'number'),
    f('effF', 'F', 'number'),
    f('effG', 'G', 'number'),
    f('tauxRemplissage', 'Taux de remplissage de la salle'),
  ],
};
const COMMENTAIRES: GdcSection = {
  title: 'COMMENTAIRES',
  fields: [f('commentaires', "Raisons d'un éventuel retard ; dysfonctionnements ; imprévus de tout genre", 'textarea')],
};

const superSundaySections: GdcSection[] = [
  { title: 'Infos', fields: [f('date', 'Date', 'date'), f('dirigeant', 'Dirigeant'), f('orateur', 'Orateur')] },
  {
    title: 'MOMENT 1',
    fields: [
      f('installation', 'Installation / Célébration'),
      f('direction', 'Direction'),
      f('proclamationVideo', 'Proclamation (vidéo)'),
      f('offrande', 'Offrande'),
      f('celebration', 'Célébration'),
      f('sainteCene', 'Sainte Cène'),
      f('temoignage', 'Témoignage'),
    ],
  },
  {
    title: 'MOMENT 2',
    fields: [
      f('adoration', 'Adoration'),
      f('msgDeroule', 'Message'),
      f('tempsDeFeu', 'Temps de feu'),
      f('offrande2', '2ème Offrande'),
      f('bloomNews', 'Bloom News'),
      f('accueilNouveaux', 'Accueil nouveaux'),
      f('priereFin', 'Prière de fin'),
    ],
  },
  MESSAGE('MESSAGE (Thème, références & bref résumé du message)'),
  EFFECTIFS,
  COMMENTAIRES,
];

const bloomSundaySections: GdcSection[] = [
  { title: 'Infos', fields: [f('date', 'Date', 'date'), f('dirigeant', 'Dirigeant'), f('orateur', 'Orateur')] },
  {
    title: 'MOMENT 1',
    fields: [
      f('installation', 'Installation / Célébration'),
      f('direction', 'Direction'),
      f('videoProclamation', 'Vidéo proclamation'),
      f('offrandes', 'Offrandes'),
      f('celebration', 'Célébration'),
      f('sainteCene', 'Sainte Cène'),
    ],
  },
  {
    title: 'MOMENT 2',
    fields: [
      f('adoration', 'Adoration'),
      f('monteeOrateur', "Montée de l'orateur"),
      f('msgDeroule', 'Message'),
      f('offrande2', '2ème Offrande'),
      f('bloomNews', 'Bloom News'),
      f('accueilNouveaux', 'Accueil nouveaux'),
      f('priereFin', 'Prière de fin'),
    ],
  },
  MESSAGE('MESSAGE (Thème, références & bref résumé du message)'),
  EFFECTIFS,
  COMMENTAIRES,
];

const speakOutSections: GdcSection[] = [
  { title: 'Infos', fields: [f('date', 'Date', 'date'), f('mc', 'MC'), f('panelistes', 'Panélistes'), f('orateur', 'Orateur')] },
  {
    title: 'DÉROULÉ',
    fields: [
      f('installation', 'Installation / Célébration'),
      f('priereOuverture', "Prière d'ouverture"),
      f('offrande', 'Offrande'),
      f('louange', 'Louange'),
      f('introTheme', 'Intro thème / micro trottoir'),
      f('videoProblematique', 'Vidéo problématique'),
      f('echangesPanel', 'Échanges / panel'),
      f('motCoach', 'Mot du coach'),
      f('offrande2BloomNews', '2ème offrande / Bloom News'),
      f('accueilNouveaux', 'Accueil nouveaux'),
      f('priereFin', 'Prière de fin'),
    ],
  },
  MESSAGE('BREF RÉSUMÉ DU THÈME (Thème & résumé du speak out)'),
  EFFECTIFS,
  COMMENTAIRES,
];

export const GDC_TEMPLATES: GdcTemplate[] = [
  // Bloom Church
  { id: 'super_sunday', title: '🔥 RAPPORT SUPER SUNDAY', sections: superSundaySections },
  { id: 'bloom_sunday', title: '🔥 RAPPORT BLOOM SUNDAY', sections: bloomSundaySections },
  { id: 'speak_out', title: '🔥 RAPPORT SPEAK OUT', sections: speakOutSections }, // = Talk Show (validé)
  // Bloom Light — fiches dédiées par branche, structures dupliquées des modèles Church.
  { id: 'light_sunday', title: 'RAPPORT LIGHT SUNDAY', sections: bloomSundaySections },
  { id: 'light_show', title: 'RAPPORT LIGHT SHOW', sections: speakOutSections },
  { id: 'super_sunday_light', title: 'RAPPORT SUPER SUNDAY — BLOOM LIGHT', sections: superSundaySections },
];

// Fiche dédiée selon l'événement ET sa branche ; null = fiche de rapport général.
export function gdcTemplateFor(event: Pick<Event, 'title' | 'branch'>): GdcTemplate | null {
  const t = event.title;
  const find = (id: string) => GDC_TEMPLATES.find((x) => x.id === id)!;
  if (event.branch === 'light') {
    if (t.includes('Light Sunday')) return find('light_sunday');
    if (t.includes('Light Show')) return find('light_show');
    if (t.includes('Super Sunday')) return find('super_sunday_light');
    return null;
  }
  if (t.includes('Super Sunday')) return find('super_sunday');
  if (t.includes('Bloom Sunday')) return find('bloom_sunday');
  if (t.includes('Talk Show')) return find('speak_out');
  return null;
}
