// Projeção isométrica 2:1.
export const TILE_W = 132
export const TILE_H = TILE_W / 2

export function isoToScreen(col: number, row: number) {
  return { x: ((col - row) * TILE_W) / 2, y: ((col + row) * TILE_H) / 2 }
}

export function diamond(cx: number, cy: number, w = TILE_W, h = TILE_H): number[] {
  return [cx, cy - h / 2, cx + w / 2, cy, cx, cy + h / 2, cx - w / 2, cy]
}
