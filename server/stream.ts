// Hub SSE — push serveur→client pour rafraîchir la cloche / alertes d'intégration
// en direct (ARCHITECTURE_TECHNIQUE.md §7 « temps réel »).
// ponytail: SSE natif plutôt que Socket.io — le besoin est unidirectionnel
// (server→client), donc zéro dépendance, reconnexion navigateur intégrée
// (EventSource), passe les proxys en HTTP/1.1. Le bidirectionnel (client→serveur)
// passe déjà par REST/sync. Passer à Socket.io le jour où un vrai canal montant existe.
import type { Response } from 'express';

const clients = new Set<Response>();

export function addClient(res: Response): void {
  clients.add(res);
  res.on('close', () => clients.delete(res));
}

// Poke SANS données : le client re-fetch ses notifs (déjà filtrées RBAC côté
// serveur) → un broadcast ne fuite rien. No-op si aucun client connecté.
export function poke(event = 'notifications'): void {
  for (const res of clients) {
    try {
      res.write(`event: ${event}\ndata: 1\n\n`);
    } catch {
      clients.delete(res);
    }
  }
}

export function clientCount(): number {
  return clients.size;
}
