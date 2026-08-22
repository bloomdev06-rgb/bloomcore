import React, { useCallback, useEffect, useRef, useState } from "react";
import { ZoomIn, RotateCcw } from "lucide-react";
import { Modal } from "./Modal";

// Cadrage de photo de profil — l'équivalent du recadrage Facebook : on déplace et on zoome
// l'image sous un masque circulaire, et c'est CE cadrage qui est enregistré.
//
// Pourquoi c'était nécessaire : l'ancien chemin (src/lib/image.ts, supprimé au profit de ce
// composant) réduisait la photo ENTIÈRE à 200/800 px sur son plus grand côté, puis l'Avatar
// l'affichait dans un cercle en `object-cover`. Le navigateur recadrait donc AU CENTRE,
// arbitrairement : sur une photo en pied ou de groupe, le visage se retrouvait coupé ou hors
// du cercle, sans aucun recours pour l'utilisateur.
//
// Sortie : un carré (pas un cercle) — le masque rond n'est qu'un habillage d'affichage, et
// stocker un carré laisse chaque vue libre de son propre arrondi. Deux tailles produites,
// exactement comme avant (vignette 200 px + large 800 px), pour ne rien changer en aval.
const VIEWPORT = 272; // px, côté de la zone de cadrage à l'écran
const THUMB_MAX = 200;
const LARGE_MAX = 800;
const MAX_ZOOM = 4;

interface PhotoCropModalProps {
  file: File;
  onCancel: () => void;
  // Reçoit les deux tailles déjà recadrées, prêtes pour apiUpload (mêmes formats qu'avant).
  onConfirm: (thumb: string, large: string) => void;
}

export default function PhotoCropModal({ file, onCancel, onConfirm }: PhotoCropModalProps) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // Échelle « couvrante » : le plus petit côté remplit exactement la zone, donc l'image
  // couvre toujours le cadre quel que soit son format (portrait comme paysage).
  const baseScale = img ? VIEWPORT / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const k = baseScale * zoom;

  // L'image ne doit jamais laisser de vide dans le cadre : on borne le déplacement aux
  // limites de l'image. Sans ça, on pouvait faire glisser la photo hors du cadre et
  // enregistrer un carré à moitié transparent.
  const clamp = useCallback(
    (o: { x: number; y: number }, scaleK: number, image: HTMLImageElement) => {
      const w = image.naturalWidth * scaleK;
      const h = image.naturalHeight * scaleK;
      return {
        x: Math.min(0, Math.max(VIEWPORT - w, o.x)),
        y: Math.min(0, Math.max(VIEWPORT - h, o.y)),
      };
    },
    [],
  );

  useEffect(() => {
    let revoked = false;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (revoked) return;
      setImg(image);
      // Centrage initial : le cadrage par défaut vaut celui d'avant (centre de l'image),
      // pour que ne rien toucher donne le même résultat qu'auparavant.
      const s = VIEWPORT / Math.min(image.naturalWidth, image.naturalHeight);
      setOffset({
        x: (VIEWPORT - image.naturalWidth * s) / 2,
        y: (VIEWPORT - image.naturalHeight * s) / 2,
      });
    };
    // HEIC iPhone / fichier corrompu : message conservé à l'identique de l'ancien chemin.
    image.onerror = () => setError("Image non prise en charge (format non supporté, ex. HEIC)");
    image.src = url;
    return () => {
      revoked = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!img) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !img) return;
    const next = {
      x: drag.current.ox + (e.clientX - drag.current.x),
      y: drag.current.oy + (e.clientY - drag.current.y),
    };
    setOffset(clamp(next, k, img));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    drag.current = null;
  };

  // Zoom centré sur le milieu du cadre : sans recalculer l'offset, zoomer déplaçait le sujet
  // hors du cercle et obligeait à repositionner à chaque cran.
  const applyZoom = (nextZoom: number) => {
    if (!img) return;
    const z = Math.min(MAX_ZOOM, Math.max(1, nextZoom));
    const nextK = baseScale * z;
    const cx = VIEWPORT / 2;
    const ratio = nextK / k;
    setOffset(clamp({ x: cx - (cx - offset.x) * ratio, y: cx - (cx - offset.y) * ratio }, nextK, img));
    setZoom(z);
  };

  const reset = () => {
    if (!img) return;
    const s = VIEWPORT / Math.min(img.naturalWidth, img.naturalHeight);
    setZoom(1);
    setOffset({
      x: (VIEWPORT - img.naturalWidth * s) / 2,
      y: (VIEWPORT - img.naturalHeight * s) / 2,
    });
  };

  // Rend le carré visible dans le cadre, à la taille demandée. La zone source se déduit de
  // l'inverse de la transformation d'affichage — un seul calcul, donc « ce qu'on voit est
  // exactement ce qui est enregistré ».
  const renderCrop = (image: HTMLImageElement, out: number): string => {
    const sx = -offset.x / k;
    const sy = -offset.y / k;
    const side = VIEWPORT / k;
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d indisponible");
    ctx.drawImage(image, sx, sy, side, side, 0, 0, out, out);
    return canvas.toDataURL("image/jpeg", 0.8);
  };

  const confirm = () => {
    if (!img) return;
    setBusy(true);
    try {
      // Une photo déjà petite ne doit pas être AGRANDIE par le recadrage (flou inutile et
      // fichier plus lourd) : on plafonne au carré réellement disponible dans la source.
      const available = Math.round(VIEWPORT / k);
      onConfirm(
        renderCrop(img, Math.min(THUMB_MAX, available)),
        renderCrop(img, Math.min(LARGE_MAX, available)),
      );
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onCancel} title="Cadrer la photo">
      <div className="space-y-4">
        {error ? (
          <p className="text-sm text-bc-danger">{error}</p>
        ) : (
          <>
            <p className="text-xs text-bc-text-secondary">
              Fais glisser la photo pour la positionner, et zoome pour ajuster. La zone dans le
              cercle est celle qui sera enregistrée.
            </p>

            <div className="flex justify-center">
              <div
                className="relative overflow-hidden bg-bc-canvas touch-none cursor-move select-none rounded-2xl"
                style={{ width: VIEWPORT, height: VIEWPORT }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                {img && (
                  <img
                    src={img.src}
                    alt=""
                    draggable={false}
                    className="absolute max-w-none origin-top-left"
                    style={{
                      left: offset.x,
                      top: offset.y,
                      width: img.naturalWidth * k,
                      height: img.naturalHeight * k,
                    }}
                  />
                )}
                {/* Masque : assombrit tout sauf le disque central. `pointer-events-none` —
                    sinon il intercepterait le glisser et le cadrage serait figé. */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: "rgba(0,0,0,0.45)",
                    WebkitMaskImage: `radial-gradient(circle at 50% 50%, transparent ${VIEWPORT / 2 - 1}px, #000 ${VIEWPORT / 2}px)`,
                    maskImage: `radial-gradient(circle at 50% 50%, transparent ${VIEWPORT / 2 - 1}px, #000 ${VIEWPORT / 2}px)`,
                  }}
                />
                <div className="absolute inset-0 pointer-events-none rounded-full border-2 border-white/80" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <ZoomIn size={16} className="text-bc-text-secondary shrink-0" />
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(e) => applyZoom(Number(e.target.value))}
                className="flex-1 accent-bc-green"
                aria-label="Zoom"
              />
              <button
                type="button"
                onClick={reset}
                className="flex items-center gap-1 text-xs text-bc-text-secondary hover:text-bc-text shrink-0"
              >
                <RotateCcw size={13} /> Recentrer
              </button>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-full text-xs font-bold text-bc-text-secondary hover:text-bc-text"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!img || !!error || busy}
            className="px-5 py-2 rounded-full bg-bc-green text-white text-xs font-ui font-bold hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Enregistrement…" : "Valider le cadrage"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
