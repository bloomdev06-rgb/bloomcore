// ponytail: home-grown scrypt password hash + HMAC-signed token instead of
// bcrypt + jsonwebtoken — neither is an installed dependency, and node:crypto
// covers both with a few lines. Upgrade path: swap for bcrypt/jsonwebtoken if
// this ever needs to interop with other services or survive a security review.
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

// Secret obligatoire : en production, refuse de démarrer si absent ou laissé à une
// valeur d'exemple — sinon un attaquant connaissant le défaut forge n'importe quel
// token de session (y compris Super Admin). En dev/test, repli déterministe local.
const IS_PROD = process.env.NODE_ENV === 'production';
export function requireSecret(name: string, weakDefaults: string[] = []): string {
  const val = process.env[name];
  if (val && val.length >= 16 && !weakDefaults.includes(val)) return val;
  if (IS_PROD) {
    throw new Error(`[BloomCore] ${name} absent, trop court (<16) ou par défaut — refus de démarrer en production. Définissez un secret fort.`);
  }
  return `dev-insecure-${name}`; // dev/test uniquement — jamais en production
}

const TOKEN_SECRET = requireSecret('AUTH_SECRET', ['change-me', 'bloomcore-dev-secret-change-in-prod']);
// Vrai quand aucun secret fort n'a été fourni (repli dev déterministe). Un serveur dans
// cet état ne doit PAS être joignable depuis le réseau : ses tokens sont forgeables.
export const usingInsecureSecret = TOKEN_SECRET.startsWith('dev-insecure-');

// Adresse d'écoute. Secret fort → '::' (dual-stack : accepte IPv4 ET IPv6, y compris
// ::1). NE PAS utiliser '0.0.0.0' : il n'écoute qu'en IPv4, or le healthcheck Docker fait
// `wget localhost` qui résout ::1 en premier sur Alpine → « connection refused » alors que
// le serveur tourne. Secret faible → loopback IPv4 seul (injoignable du réseau = échec
// visible d'un déploiement qui a oublié AUTH_SECRET, plutôt que des tokens forgeables exposés).
export function resolveBindHost(insecure: boolean, override?: string): string {
  return override || (insecure ? '127.0.0.1' : '::');
}
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12h

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function signToken(memberId: string): string {
  const payload = JSON.stringify({ sub: memberId, pv: passwordVersion(memberId), exp: Date.now() + TOKEN_TTL_MS });
  const body = Buffer.from(payload).toString('base64url');
  const sig = createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

// Version du mot de passe d'un membre (0 si aucun credential). Incrémentée à chaque
// changement de mot de passe → invalide tous les tokens émis avant (voir verifyToken).
export function passwordVersion(memberId: string): number {
  const row = db.prepare('SELECT pwd_version FROM credentials WHERE member_id = ?').get(memberId) as
    | { pwd_version: number }
    | undefined;
  return row?.pwd_version ?? 0;
}

// --- Tokens à usage unique (activation 48h / réinitialisation 1h) ---
import { db } from './db.ts';

const PURPOSE_TTL_MS: Record<string, number> = {
  activate: 48 * 60 * 60 * 1000,
  reset: 1 * 60 * 60 * 1000,
};

export function createOneTimeToken(memberId: string, purpose: 'activate' | 'reset'): string {
  const token = randomBytes(24).toString('base64url');
  db.prepare('INSERT INTO tokens (token, member_id, purpose, expires_at) VALUES (?, ?, ?, ?)').run(
    token, memberId, purpose, Date.now() + PURPOSE_TTL_MS[purpose],
  );
  return token;
}

// Consomme le token (usage unique) — null si inconnu, expiré ou déjà utilisé.
export function consumeOneTimeToken(token: string): { memberId: string; purpose: string } | null {
  const row = db.prepare('SELECT member_id, purpose, expires_at, used_at FROM tokens WHERE token = ?').get(token) as
    | { member_id: string; purpose: string; expires_at: number; used_at: number | null }
    | undefined;
  if (!row || row.used_at || Date.now() > row.expires_at) return null;
  db.prepare('UPDATE tokens SET used_at = ? WHERE token = ?').run(Date.now(), token);
  return { memberId: row.member_id, purpose: row.purpose };
}

export function upsertCredentials(memberId: string, password: string): void {
  // Changement de mot de passe (UPDATE) → pwd_version++ : révoque tous les tokens antérieurs.
  // Première définition (INSERT à l'activation) → version 0, aucune session à invalider.
  db.prepare(
    `INSERT INTO credentials (member_id, password_hash, pwd_version) VALUES (?, ?, 0)
     ON CONFLICT(member_id) DO UPDATE SET password_hash = excluded.password_hash, pwd_version = pwd_version + 1`,
  ).run(memberId, hashPassword(password));
}

export function verifyToken(token: string): string | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const { sub, pv, exp } = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (Date.now() > exp) return null;
    // Révocation au changement de mot de passe (#11) : un token émis avant le dernier
    // changement porte une pv obsolète. ponytail: 1 lecture DB par requête, OK à cette
    // échelle (SQLite synchrone) ; mettre en cache si le débit l'exige un jour.
    if ((pv ?? 0) !== passwordVersion(sub as string)) return null;
    return sub as string;
  } catch {
    return null;
  }
}
