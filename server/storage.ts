// Adaptateur de stockage objet (Phase 5, T5.2) — interface unique, deux implémentations :
// disque (repli dev, comportement identique à avant cette phase) et S3/MinIO (prod, quand
// S3_ENDPOINT est défini). server/index.ts ne connaît que getStorage()/StorageAdapter,
// jamais fs ni @aws-sdk directement pour les uploads — c'est ce qui permet à T5.3/T5.4 de
// migrer disque→MinIO sans toucher aux routes.
//
// ponytail: dépendance ajoutée UNIQUEMENT pour ce fichier (@aws-sdk/client-s3 +
// @aws-sdk/s3-request-presigner) — rien d'autre du SDK AWS n'est utilisé, MinIO est
// S3-compatible donc ce client suffit sans dépendance MinIO dédiée.
import fs from 'node:fs';
import path from 'node:path';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as s3PresignGetUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';

export const SIGNED_URL_TTL_SEC = 900; // 15 min (T5.2)

export interface StorageAdapter {
  putObject(key: string, buf: Buffer, contentType: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  // Disque : renvoie l'URL statique /uploads/<key> historique (pas de vraie expiration —
  // protégée par requireAuth sur /uploads, voir index.ts). S3/MinIO : URL signée à durée de
  // vie ttlSec, expire réellement (403 passé ce délai, vérifié en usage réel — T5.3).
  getSignedUrl(key: string, ttlSec?: number): Promise<string>;
}

class DiskStorage implements StorageAdapter {
  constructor(private dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }
  async putObject(key: string, buf: Buffer): Promise<void> {
    const file = path.join(this.dir, key);
    if (!fs.existsSync(file)) fs.writeFileSync(file, buf);
  }
  async exists(key: string): Promise<boolean> {
    return fs.existsSync(path.join(this.dir, key));
  }
  async getSignedUrl(key: string): Promise<string> {
    return `/uploads/${key}`;
  }
}

class S3Storage implements StorageAdapter {
  private client: S3Client;
  constructor(
    private bucket: string,
    endpoint: string,
    accessKeyId: string,
    secretAccessKey: string,
  ) {
    // forcePathStyle : MinIO (et la plupart des S3-compatibles auto-hébergés) n'a pas de
    // DNS virtual-hosted-style par bucket — sans ce flag, le SDK AWS construit des URLs
    // <bucket>.<endpoint> qui ne résolvent nulle part hors AWS réel.
    this.client = new S3Client({
      endpoint,
      region: 'us-east-1', // MinIO ignore la région mais le SDK l'exige ; valeur arbitraire stable.
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  async putObject(key: string, buf: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buf, ContentType: contentType }));
  }
  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
  async getSignedUrl(key: string, ttlSec: number = SIGNED_URL_TTL_SEC): Promise<string> {
    return s3PresignGetUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: ttlSec });
  }
}

let adapter: StorageAdapter | null = null;
let mode: 'disk' | 's3' | null = null;

// uploadDirFallback : ignoré en mode S3, utilisé tel quel en mode disque (même chemin que
// l'actuel UPLOAD_DIR de index.ts — aucune migration de structure requise pour rester en disque).
export function getStorage(uploadDirFallback: string): StorageAdapter {
  if (adapter) return adapter;
  const endpoint = process.env.S3_ENDPOINT;
  if (endpoint) {
    const bucket = process.env.S3_BUCKET || 'bloomcore';
    const accessKeyId = process.env.S3_ACCESS_KEY || '';
    const secretAccessKey = process.env.S3_SECRET_KEY || '';
    adapter = new S3Storage(bucket, endpoint, accessKeyId, secretAccessKey);
    mode = 's3';
  } else {
    adapter = new DiskStorage(uploadDirFallback);
    mode = 'disk';
  }
  return adapter;
}

export function storageMode(): 'disk' | 's3' | null {
  return mode;
}

// Réservé aux tests (storage.check.ts) : force une réinitialisation propre entre deux
// scénarios plutôt que de dépendre de l'ordre d'exécution du singleton module-level.
export function resetStorageForTests(): void {
  adapter = null;
  mode = null;
}
