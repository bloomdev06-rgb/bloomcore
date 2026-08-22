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
export function dotIcon(color: string): L.DivIcon {
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

// Un Bloom Bus positionné sur la carte (son centre) — affiché à tout niveau de drill-down,
// en plus des membres/responsables, pour donner une vraie référence territoriale (§12).
export interface BusPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface TerritoryMapProps {
  mode: TerritoryMapMode;
  members?: Member[]; // mode === "members"
  leaders?: LeaderPin[]; // mode === "leaders"
  buses?: BusPin[]; // marqueurs bus, superposés au mode courant
  onSelectBus?: (busId: string) => void; // popup -> ouvrir la fiche du bus
  className?: string;
}

export function TerritoryMap({ mode, members = [], leaders = [], buses = [], onSelectBus, className }: TerritoryMapProps) {
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

  // Chaque bus garde son propre marqueur — le regroupement visuel n'est jamais automatique,
  // seul un rattachement explicite à une Zone agrège (voir stats par zone dans BloomBusView).
  // Coordonnées strictement identiques (ex: bus sans centre précis encore renseigné) : décalage
  // déterministe en cercle autour du point partagé pour que chaque marqueur reste cliquable.
  const exactGroups = new Map<string, BusPin[]>();
  buses.forEach((b) => {
    const key = `${b.lat},${b.lng}`;
    const group = exactGroups.get(key);
    if (group) group.push(b);
    else exactGroups.set(key, [b]);
  });
  const OFFSET_DEG = 0.0003; // ~30m à l'équateur, suffisant pour séparer visuellement à ce zoom
  const busContent = Array.from(exactGroups.values()).flatMap((group) =>
    group.map((b, i) => {
      const angle = (i / group.length) * 2 * Math.PI;
      const lat = b.lat + (group.length > 1 ? OFFSET_DEG * Math.sin(angle) : 0);
      const lng = b.lng + (group.length > 1 ? OFFSET_DEG * Math.cos(angle) : 0);
      return (
        <Marker key={b.id} position={[lat, lng]} icon={dotIcon("var(--color-bc-orange, #F38B36)")}>
          <Popup>
            <button
              type="button"
              onClick={() => onSelectBus?.(b.id)}
              className="text-left text-xs font-bold text-bc-green hover:underline"
            >
              {b.name}
            </button>
          </Popup>
        </Marker>
      );
    })
  );
  content = [content, busContent];
  bounds = [...bounds, ...buses.map((b) => [b.lat, b.lng] as LatLng)];

  const mapBounds = bounds.length > 0 ? (bounds as L.LatLngBoundsExpression) : undefined;
  // force remount quand le mode OU le jeu de données affiché change (ex: Commune -> Vue
  // globale reste en mode "leaders" mais avec un set de responsables différent) — bounds/
  // center ne se recalculent pas seuls sur un MapContainer déjà monté.
  const contentKey = `${mode}:${(mode === "members" ? members : leaders).map((x) => x.id).join(",")}:${buses.map((b) => b.id).join(",")}`;

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
