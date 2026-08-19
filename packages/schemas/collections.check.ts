// Run: npx tsx packages/schemas/collections.check.ts
import assert from 'node:assert';
import {
  EventSchema, NotificationSchema, CertificationSchema, IntegrationReportSchema,
  MinistrySchema, DepartmentSchema, ActivitySchema, ProjectSchema, BusLineSchema, FormSchema,
} from './collections.ts';
import {
  INITIAL_EVENTS, INITIAL_NOTIFICATIONS, INITIAL_MINISTRIES, INITIAL_DEPARTMENTS,
  INITIAL_ACTIVITIES, INITIAL_PROJECTS, INITIAL_BUS_LINES, INITIAL_FORMS,
} from '../../src/mockData.ts';

function checkSeedAndStrict(label: string, schema: { safeParse: (v: unknown) => any }, seedItem: unknown) {
  const ok = schema.safeParse(seedItem);
  assert.ok(ok.success, `${label}: un item du seed doit être accepté — ${ok.success ? '' : JSON.stringify(ok.error.issues)}`);
  const rejected = schema.safeParse({ ...(seedItem as object), hack: 1 });
  assert.equal(rejected.success, false, `${label}: un champ inconnu doit être rejeté (.strict())`);
}

checkSeedAndStrict('events', EventSchema, INITIAL_EVENTS[0]);
checkSeedAndStrict('notifications', NotificationSchema, INITIAL_NOTIFICATIONS[0]);
checkSeedAndStrict('ministries', MinistrySchema, INITIAL_MINISTRIES[0]);
checkSeedAndStrict('departments', DepartmentSchema, INITIAL_DEPARTMENTS[0]);
checkSeedAndStrict('activities', ActivitySchema, INITIAL_ACTIVITIES[0]);
checkSeedAndStrict('projects', ProjectSchema, INITIAL_PROJECTS[0]);
checkSeedAndStrict('bus_lines', BusLineSchema, INITIAL_BUS_LINES[0]);
checkSeedAndStrict('forms', FormSchema, INITIAL_FORMS[0]);

// Pas de seed pour certifications/integration_reports (collections vides au boot,
// peuplées uniquement à l'usage) — fixtures représentatives du shape réel des composants.
checkSeedAndStrict('certifications', CertificationSchema, {
  id: 'cert_1', memberId: 'mem_1', memberName: 'Test', formation: 'Vases d\'Honneur',
  date: '2026-01-01', courseTitle: 'Module 1', certifiedAt: '2026-01-02', source: 'academy', level: 'stagiaire',
});
checkSeedAndStrict('integration_reports', IntegrationReportSchema, {
  id: 'ir_1', memberId: 'mem_1', authorName: 'Coach Test', date: '2026-01-01',
  status: 'En cours', contactEstablished: true, visitDone: false, notes: 'RAS', motif: 'Suivi hebdo',
});

console.log('collections.check OK');
