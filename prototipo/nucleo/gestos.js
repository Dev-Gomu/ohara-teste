// Núcleo (regras puras): toque duplo e zoom do slide (50% a 300%).

export const TOQUE_DUPLO = { ms: 320, px: 24 };
export const ZOOM = { min: 0.5, max: 3, passo: 0.25 };

/** `anterior` e `atual`: { t, x, y } (tempo em ms e posição). */
export function ehToqueDuplo(anterior, atual) {
  if (!anterior || !atual) return false;
  return atual.t - anterior.t <= TOQUE_DUPLO.ms && Math.hypot(atual.x - anterior.x, atual.y - anterior.y) <= TOQUE_DUPLO.px;
}
export const prenderZoom = (z) => Math.round(Math.min(ZOOM.max, Math.max(ZOOM.min, z)) * 100) / 100;
export const zoomPelaRoda = (zoom, deltaY) => prenderZoom(deltaY < 0 ? zoom * 1.1 : deltaY > 0 ? zoom / 1.1 : zoom);
export const alternarZoomDuplo = (zoom) => (zoom <= 1.01 ? 2 : 1);
export const zoomEmPorcento = (zoom) => `${Math.round(zoom * 100)}%`;
