// Web Push côté client : (dé)abonnement au canal push. Requiert HTTPS + SW enregistré
// (main.tsx, prod uniquement). Sur http nu ou navigateur non compatible → pushSupported()
// = false et tout est no-op : l'app reste fonctionnelle, le canal push est juste indisponible.
const API_BASE = (import.meta as any).env?.VITE_API_BASE
  || ((import.meta as any).env?.DEV ? 'http://localhost:4000/api/v1' : '/api/v1');

export function pushSupported(): boolean {
  return typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
    && typeof window !== 'undefined'
    && 'PushManager' in window
    && 'Notification' in window;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('bc_authToken');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

// La clé VAPID publique arrive en base64url ; PushManager veut un Uint8Array.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function pushEnabled(): Promise<boolean> {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(await reg?.pushManager.getSubscription());
}

// Retourne true si l'abonnement a été créé et enregistré serveur. false = non supporté,
// VAPID non configuré serveur, ou permission refusée.
export async function enablePush(): Promise<boolean> {
  if (!pushSupported()) return false;
  const keyRes = await fetch(`${API_BASE}/push/public-key`, { headers: authHeaders() });
  const { key } = await keyRes.json();
  if (!key) return false; // serveur sans VAPID → push non configuré
  if ((await Notification.requestPermission()) !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });
  const json: any = sub.toJSON(); // { endpoint, keys: { p256dh, auth } }
  const res = await fetch(`${API_BASE}/push/subscribe`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
  return res.ok;
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  await fetch(`${API_BASE}/push/unsubscribe`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ endpoint }),
  }).catch(() => {});
}
