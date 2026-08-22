// Normalise un numéro pour la déduplication — chiffres seulement, indicatif +225 retiré s'il
// est présent : "+225 07 12 34 56 78" et "07 12 34 56 78" doivent matcher le même contact
// (bug identifié Phase 0 : l'égalité stricte utilisée jusqu'ici créait deux fiches).
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('225') && digits.length > 10 ? digits.slice(3) : digits;
}
