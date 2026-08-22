#!/bin/sh
# Sauvegarde Postgres + PHOTOS — image postgres:18-alpine (pg_dump déjà présent, pas de dépendance
# supplémentaire à installer pour le dump local). Utilisé par le service `backup` de
# docker-compose.yml (mode tout-en-un) ET par infra/Dockerfile.backup (architecture éclatée,
# Application Dokploy indépendante) — d'où la connexion DB paramétrable ci-dessous plutôt que
# le hostname `db` en dur : en mode tout-en-un, BACKUP_DB_HOST vaut `db` par défaut (nom du
# service compose) ; en architecture éclatée, le mettre sur l'Internal Host du Postgres
# natif Dokploy (visible dans le dashboard de la ressource Database).
#
# Boucle infinie volontaire (pas de cron dans l'image alpine par défaut) : dump immédiat au
# démarrage du conteneur, puis toutes les 24h. Rétention locale : les dumps plus vieux que
# BACKUP_RETENTION_DAYS sont supprimés à chaque tour.
#
# Copie hors-site (Cloudflare R2, optionnelle) : si R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/
# R2_SECRET_ACCESS_KEY/R2_BUCKET sont tous renseignés, chaque dump réussi est en plus copié
# vers R2 via rclone (installé au démarrage du conteneur — apk, pas d'image custom à builder).
# Rétention distante séparée (R2_RETENTION_DAYS, défaut plus long que le local : le stockage
# R2 est quasi gratuit jusqu'à 10 Go). Sans ces 4 variables : comportement inchangé, local
# uniquement — voir le commentaire du service `backup` dans docker-compose.yml.
#
# IMPORTANT — le dump local seul protège contre une erreur applicative, une migration ratée
# ou une suppression accidentelle (volume bloomcore-backups SÉPARÉ du volume Postgres actif),
# mais PAS contre une perte du serveur/hôte lui-même. La copie R2 ci-dessus est ce qui couvre
# ce second cas.
#
# --- PHOTOS (BACKUP_UPLOADS_DIR, défaut /data/uploads) -------------------------------------
# `pg_dump` ne sauvegarde QUE Postgres. En mode disque (S3_ENDPOINT absent, le défaut), les
# photos des membres sont des FICHIERS sur le volume /data : sans ce qui suit, une perte de ce
# volume laissait la base restaurable mais TOUTES les photos définitivement perdues.
#
# Elles sont traitées différemment des dumps, pour trois raisons tenant à leur nature :
#
# 1. MIROIR INCRÉMENTAL, PAS D'ARCHIVE QUOTIDIENNE. Un nom de fichier photo est le hash SHA-1
#    de son contenu (server/index.ts storeImage) : le contenu est donc immuable et un fichier
#    déjà copié n'a jamais besoin de l'être à nouveau. Un tar quotidien recopierait chaque jour
#    l'intégralité des photos (≈ 110 Ko/membre × 14 jours de rétention) pour zéro information
#    nouvelle. On copie donc uniquement ce qui manque à destination.
#
# 2. JAMAIS DE SUPPRESSION CÔTÉ COPIE — `rclone copy`, surtout pas `rclone sync`. `sync` aligne
#    la destination sur la source : si le volume /data était perdu ou simplement démonté, le
#    tour suivant SUPPRIMERAIT la copie R2, c'est-à-dire exactement la sauvegarde qu'on vient
#    de perdre. `copy` n'efface jamais rien à destination.
#
# 3. AUCUNE RÉTENTION SUR LES PHOTOS. Une photo « ancienne » n'est pas périmée : elle reste
#    référencée par le champ avatarUrl d'une fiche membre tant que la fiche existe. Lui
#    appliquer la purge par âge des dumps casserait l'avatar de tous les anciens membres à la
#    restauration. La purge --min-age ci-dessous ne vise donc QUE backups/, jamais uploads/.
#
# Dossier absent (mode S3/MinIO, ou volume non monté) = étape ignorée avec un message, pas une
# erreur : le dump Postgres doit rester prioritaire et ne jamais être empêché par les photos.
set -eu

mkdir -p /backups
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
R2_RETENTION_DAYS="${R2_RETENTION_DAYS:-90}"
DB_HOST="${BACKUP_DB_HOST:-db}"
DB_PORT="${BACKUP_DB_PORT:-5432}"
DB_USER="${BACKUP_DB_USER:-postgres}"
DB_NAME="${BACKUP_DB_NAME:-bloomcore}"
# Doit correspondre à dirname(BLOOMCORE_DB)/uploads côté backend (cf. server/index.ts).
UPLOADS_DIR="${BACKUP_UPLOADS_DIR:-/data/uploads}"
UPLOADS_MIRROR=/backups/uploads

# Miroir local + copie R2 des photos. Incrémental et sans suppression (voir l'en-tête).
backup_uploads() {
  if [ ! -d "${UPLOADS_DIR}" ]; then
    echo "[backup] photos : ${UPLOADS_DIR} absent — étape ignorée (mode S3, ou volume non monté ?)"
    return 0
  fi
  count=$(find "${UPLOADS_DIR}" -type f | wc -l | tr -d ' ')
  if [ "${count}" = "0" ]; then
    echo "[backup] photos : aucun fichier dans ${UPLOADS_DIR} — rien à copier"
    return 0
  fi

  # Miroir local sur le volume des sauvegardes, SÉPARÉ du volume /data : couvre la perte du
  # volume photos seul. -n (no-clobber) rend la copie incrémentale : les fichiers déjà là ne
  # sont pas réécrits, et comme le nom est le hash du contenu, « déjà là » signifie « identique ».
  mkdir -p "${UPLOADS_MIRROR}"
  if cp -Rn "${UPLOADS_DIR}/." "${UPLOADS_MIRROR}/" 2>/dev/null; then
    echo "[backup] photos : miroir local à jour (${count} fichier(s), $(du -sh "${UPLOADS_MIRROR}" | cut -f1))"
  else
    echo "[backup] photos : miroir local partiel (certains fichiers déjà présents ou illisibles)" >&2
  fi

  # Copie hors-site : seul remède à la perte de l'hôte entier.
  if [ "${R2_ENABLED}" = "1" ]; then
    if rclone copy "${UPLOADS_DIR}" "r2:${R2_BUCKET}/uploads"; then
      echo "[backup] photos : copiées vers R2 (r2:${R2_BUCKET}/uploads)"
    else
      echo "[backup] photos : ÉCHEC copie R2 — on réessaiera au prochain tour" >&2
    fi
  fi
}

R2_ENABLED=0
if [ -n "${R2_ACCOUNT_ID:-}" ] && [ -n "${R2_ACCESS_KEY_ID:-}" ] && [ -n "${R2_SECRET_ACCESS_KEY:-}" ] && [ -n "${R2_BUCKET:-}" ]; then
  R2_ENABLED=1
  echo "[backup] copie hors-site R2 activée (bucket ${R2_BUCKET}, rétention distante ${R2_RETENTION_DAYS}j)"
  echo "[backup] installation de rclone..."
  apk add --no-cache rclone >/tmp/rclone-install.log 2>&1 || { echo "[backup] échec install rclone — copie R2 désactivée pour cette exécution" >&2; R2_ENABLED=0; }
  export RCLONE_CONFIG_R2_TYPE=s3
  export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
  export RCLONE_CONFIG_R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
  export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
  export RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
  export RCLONE_CONFIG_R2_ACL=private
else
  echo "[backup] R2_* absent(es) — copie hors-site désactivée, sauvegarde locale uniquement"
fi

echo "[backup] service démarré — dump toutes les 24h, rétention locale ${RETENTION_DAYS}j, volume bloomcore-backups"

while true; do
  ts=$(date +%Y%m%d-%H%M%S)
  file="/backups/bloomcore-${ts}.sql.gz"
  echo "[backup] $(date -Iseconds) dump → ${file}"
  if pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" | gzip > "${file}.tmp"; then
    mv "${file}.tmp" "${file}"
    echo "[backup] OK ($(du -h "${file}" | cut -f1))"
    if [ "${R2_ENABLED}" = "1" ]; then
      if rclone copyto "${file}" "r2:${R2_BUCKET}/backups/$(basename "${file}")"; then
        echo "[backup] copié vers R2"
      else
        echo "[backup] ÉCHEC copie R2 — dump local conservé, on réessaiera au prochain tour" >&2
      fi
    fi
  else
    echo "[backup] ÉCHEC du dump — fichier partiel supprimé" >&2
    rm -f "${file}.tmp"
  fi
  # Photos APRÈS le dump : une erreur ici ne doit jamais empêcher la sauvegarde de la base.
  backup_uploads || echo "[backup] photos : étape en échec (non bloquant pour le dump)" >&2

  # Purge par âge : dumps UNIQUEMENT. Le motif de nom et le chemin r2 backups/ excluent tous
  # deux les photos — voir le point 3 de l'en-tête (une photo ancienne reste référencée).
  find /backups -name 'bloomcore-*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete
  if [ "${R2_ENABLED}" = "1" ]; then
    rclone delete "r2:${R2_BUCKET}/backups" --min-age "${R2_RETENTION_DAYS}d" || echo "[backup] échec purge rétention R2 (non bloquant)" >&2
  fi
  sleep 86400
done
