import assert from 'node:assert';
import type { Member } from '../types';
import { compareMembersByLastName } from './memberSort.ts';

const member = (id: string, lastName: string, firstName: string) => ({ id, lastName, firstName }) as Member;

const sorted = [
  member('3', ' Zadi ', 'Alice'),
  member('2', 'Bamba', 'Awa'),
  member('1', 'Abé', 'Zoé'),
  member('4', 'Bamba', 'Adama'),
].sort(compareMembersByLastName);

assert.deepEqual(
  sorted.map(item => item.id),
  ['1', '4', '2', '3'],
  'les membres sont triés par nom, puis prénom, sans dépendre des espaces ou accents',
);

console.log('memberSort.check OK');
