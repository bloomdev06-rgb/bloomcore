// Carte territoriale Leaflet — remplace l'iframe OSM statique par une vraie carte (pins),
// même source de tuiles gratuite (OpenStreetMap), pas de clé API. Le mode (membres /
// responsables) reflète le niveau de drill-down sélectionné dans la sidebar Bloom Bus,
// pas le rôle directement — voir BloomBusView pour le mapping.
import "leaflet/dist/leaflet.css";
import type { ReactNode } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { Member } from "../../types";

type LatLng = [number, number];

// Pin coloré en DivIcon — évite le souci classique des icônes par défaut Leaflet cassées
// par le bundler (chemins d'assets non résolus par Vite).
function dotIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

const DEFAULT_CENTER: LatLng = [5.35, -4.02]; // Abidjan, repli si aucune donnée GPS

// Un responsable positionné sur la carte : capitaine (niveau Zone), responsable de zone
// (niveau Commune) ou responsable de commune (niveau Accueil) — voir BloomBusView pour le
// calcul (position = gps propre du responsable, repli sur le centre du bus/zone/commune).
export interface LeaderPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export type TerritoryMapMode = "members" | "leaders";

interface TerritoryMapProps {
  mode: TerritoryMapMode;
  members?: Member[]; // mode === "members"
  leaders?: LeaderPin[]; // mode === "leaders"
  className?: string;
}

export function TerritoryMap({ mode, members = [], leaders = [], className }: TerritoryMapProps) {
  let bounds: LatLng[] = [];
  let content: ReactNode = null;

  if (mode === "members") {
    const pts = members.filter((m) => m.gps).map((m) => [m.gps!.lat, m.gps!.lng] as LatLng);
    bounds = pts;
    content = members
      .filter((m) => m.gps)
      .map((m) => (
        <Marker key={m.id} position={[m.gps!.lat, m.gps!.lng]} icon={dotIcon("var(--color-bc-green, #16a34a)")}>
          <Popup>{m.firstName} {m.lastName}</Popup>
        </Marker>
      ));
  } else {
    bounds = leaders.map((l) => [l.lat, l.lng] as LatLng);
    content = leaders.map((l) => (
      <Marker key={l.id} position={[l.lat, l.lng]} icon={dotIcon("var(--color-bc-cerulean, #0ea5e9)")}>
        <Popup>{l.name}</Popup>
      </Marker>
    ));
  }

  const mapBounds = bounds.length > 0 ? (bounds as L.LatLngBoundsExpression) : undefined;
  // force remount quand le mode OU le jeu de données affiché change (ex: Commune -> Vue
  // globale reste en mode "leaders" mais avec un set de responsables différent) — bounds/
  // center ne se recalculent pas seuls sur un MapContainer déjà monté.
  const contentKey = `${mode}:${(mode === "members" ? members : leaders).map((x) => x.id).join(",")}`;

  return (
    <MapContainer
      key={contentKey}
      bounds={mapBounds}
      center={mapBounds ? undefined : DEFAULT_CENTER}
      zoom={mapBounds ? undefined : 12}
      className={className ?? "absolute inset-0 w-full h-full"}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {content}
    </MapContainer>
  );
}
