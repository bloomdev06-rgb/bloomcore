#!/bin/sh
# Restauration d'un dump créé par backup-postgres.sh. À lancer DEPUIS L'HÔTE (pas dans un
# conteneur), avec docker compose disponible dans le dossier du projet.
#
# Usage : ./scripts/restore-postgres.sh bloomcore-20260819-030000.sql.gz
#
# Si le dump n'est disponible que sur Cloudflare R2 (volume local perdu — reprise après
# sinistre) : le télécharger d'abord dans le volume, ex.
#   docker compose exec backup rclone copyto r2:<bucket>/backups/<fichier> /backups/<fichier>
# puis lancer ce script normalement.
#
# ATTENTION : écrase la base `bloomcore` actuelle. Arrêter l'API/worker avant restauration
# évite des écritures concurrentes pendant l'import.
set -eu

FILE="${1:?Usage: restore-postgres.sh <nom-du-fichier-dans-le-volume-bloomcore-backups>}"

echo "Ceci va ÉCRASER la base 'bloomcore' actuelle avec le contenu de ${FILE}."
printf 'Continuer ? (taper "oui" pour confirmer) : '
read -r CONFIRM
if [ "$CONFIRM" != "oui" ]; then
  echo "Annulé."
  exit 1
fi

echo "→ Arrêt de l'API et du worker (le service db et backup restent actifs)..."
docker compose stop bloomcore worker

echo "→ Restauration..."
# Exécuté depuis le conteneur `backup` : c'est lui qui a le volume bloomcore-backups monté
# (le dump y est), et il a accès réseau à `db` comme les autres services du compose.
docker compose exec -T backup sh -c "gunzip -c /backups/${FILE} | psql -h db -U postgres -d bloomcore"

echo "→ Redémarrage de l'API et du worker..."
docker compose start bloomcore worker

echo "Restauration terminée."
