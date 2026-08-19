#!/bin/sh
# Sauvegarde Postgres — service "backup" de docker-compose.yml (image postgres:16-alpine,
# qui contient déjà pg_dump : pas de dépendance supplémentaire à installer pour le dump local).
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
set -eu

mkdir -p /backups
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
R2_RETENTION_DAYS="${R2_RETENTION_DAYS:-90}"

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
  if pg_dump -h db -U postgres -d bloomcore | gzip > "${file}.tmp"; then
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
  find /backups -name 'bloomcore-*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete
  if [ "${R2_ENABLED}" = "1" ]; then
    rclone delete "r2:${R2_BUCKET}/backups" --min-age "${R2_RETENTION_DAYS}d" || echo "[backup] échec purge rétention R2 (non bloquant)" >&2
  fi
  sleep 86400
done
