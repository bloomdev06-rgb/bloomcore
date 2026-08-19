#!/bin/sh
# Sauvegarde Postgres — service "backup" de docker-compose.yml (image postgres:16-alpine,
# qui contient déjà pg_dump : pas de dépendance supplémentaire à installer).
#
# Boucle infinie volontaire (pas de cron dans l'image alpine par défaut) : dump immédiat au
# démarrage du conteneur, puis toutes les 24h. Rétention locale : les dumps plus vieux que
# BACKUP_RETENTION_DAYS sont supprimés à chaque tour.
#
# IMPORTANT — ceci protège contre une erreur applicative, une migration ratée ou une
# suppression accidentelle (le volume bloomcore-backups est SÉPARÉ du volume Postgres actif).
# Ça ne protège PAS contre une perte du serveur/hôte lui-même : le volume Docker reste sur
# la même machine. Pour une vraie reprise après sinistre, copier périodiquement le contenu
# de /backups (volume bloomcore-backups) hors du serveur — voir le commentaire dans
# docker-compose.yml à côté du service `backup` pour les options.
set -eu

mkdir -p /backups
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
echo "[backup] service démarré — dump toutes les 24h, rétention ${RETENTION_DAYS}j, volume bloomcore-backups"

while true; do
  ts=$(date +%Y%m%d-%H%M%S)
  file="/backups/bloomcore-${ts}.sql.gz"
  echo "[backup] $(date -Iseconds) dump → ${file}"
  if pg_dump -h db -U postgres -d bloomcore | gzip > "${file}.tmp"; then
    mv "${file}.tmp" "${file}"
    echo "[backup] OK ($(du -h "${file}" | cut -f1))"
  else
    echo "[backup] ÉCHEC du dump — fichier partiel supprimé" >&2
    rm -f "${file}.tmp"
  fi
  find /backups -name 'bloomcore-*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete
  sleep 86400
done
