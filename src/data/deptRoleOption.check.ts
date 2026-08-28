// Régression #25 : le bouton d'affectation annonçait « comme Responsable de Zone » alors que
// personne n'avait choisi ce rôle.
//
// À l'ouverture d'une fiche, le menu « Fonction occupée » était préchargé avec la fonction
// STOCKÉE du membre. Si celle-ci venait de la hiérarchie Bloom Bus (responsable_zone,
// responsable_commune), elle n'existait pas parmi les options : le menu affichait donc autre
// chose que la valeur réellement en mémoire — et c'est la mémoire qui partait à
// l'enregistrement. Écran et donnée divergeaient en silence.
//
// Règle : la valeur préchargée doit toujours appartenir à la liste des options. Les rôles
// Bloom Bus se gèrent dans le module Bloom Bus, pas depuis la fiche membre.
import assert from 'node:assert';
import { DEPT_ROLE_OPTIONS, asDeptRoleOption } from '../components/MemberFormModal.tsx';
import { labelFor } from '../../packages/shared/migrate.ts';

// Les fonctions ordinaires sont conservées telles quelles.
for (const fn of DEPT_ROLE_OPTIONS) {
  assert.equal(asDeptRoleOption(fn), fn, `${fn} doit être conservé`);
}

// Les rôles de la hiérarchie Bloom Bus ne sont pas des options du menu : ils retombent sur
// « membre » plutôt que de rester en mémoire à l'insu de l'utilisateur.
for (const fn of ['responsable_zone', 'responsable_commune', 'responsable_section', 'tresorier']) {
  assert.equal(asDeptRoleOption(fn), 'membre', `${fn} ne doit pas être préchargé`);
  assert.ok(!(DEPT_ROLE_OPTIONS as readonly string[]).includes(fn));
}

// Valeurs absentes ou aberrantes : même repli neutre, jamais d'état hors liste.
for (const fn of [undefined, null, '', 'n_importe_quoi', 42]) {
  assert.equal(asDeptRoleOption(fn), 'membre');
}

// Toute option a un libellé propre : le bouton « Affecter à X comme … » affiche donc
// exactement le rôle sélectionné, et jamais une valeur brute.
for (const r of DEPT_ROLE_OPTIONS) {
  assert.notEqual(labelFor(r), r, `${r} doit avoir un libellé lisible`);
}
assert.equal(labelFor('responsable'), 'Responsable');
assert.equal(labelFor('capitaine'), 'Capitaine de Bus');

console.log('deptRoleOption.check OK');
