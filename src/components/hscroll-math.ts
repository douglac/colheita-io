/** Contas da faixa horizontal (HScroll), sem DOM: dá para testar. */

/** Quanto um toque/clique pode andar e ainda valer como clique (px). */
export const DRAG_SLOP = 8

export type Metrics = { left: number; width: number; scroll: number } // scrollLeft, clientWidth, scrollWidth

const maxLeft = (m: Metrics) => Math.max(0, m.scroll - m.width)
const clamp = (v: number, m: Metrics) => Math.min(maxLeft(m), Math.max(0, v))

/** Em que ponta a faixa está (com 1 px de folga para arredondamento do navegador). */
export function edges(m: Metrics): { overflow: boolean; atStart: boolean; atEnd: boolean } {
  const overflow = m.scroll - m.width > 1
  return { overflow, atStart: !overflow || m.left <= 1, atEnd: !overflow || m.left >= maxLeft(m) - 1 }
}

/**
 * Uma "página" para o lado: a largura visível. Se `starts` (início de cada item) vier, a página para
 * no último item que começa dentro dela, assim nenhum item fica pela metade na borda de onde veio.
 */
export function pageTarget(m: Metrics, dir: 1 | -1, starts?: number[]): number {
  const raw = clamp(m.left + dir * m.width, m)
  if (!starts?.length || raw === 0 || raw === maxLeft(m)) return raw
  if (dir > 0) {
    // o item cortado na borda direita vira o primeiro da próxima página
    const cut = [...starts].reverse().find((s) => s > m.left + 1 && s <= m.left + m.width)
    return clamp(cut != null && cut < raw ? cut : raw, m)
  }
  const first = starts.find((s) => s >= raw - 1)
  return clamp(first ?? raw, m)
}

/** Um item para o lado: o início do próximo (ou do anterior) item a partir de onde a faixa está. */
export function itemTarget(m: Metrics, dir: 1 | -1, starts: number[]): number {
  const s = dir > 0 ? starts.find((x) => x > m.left + 1) : [...starts].reverse().find((x) => x < m.left - 1)
  return clamp(s ?? (dir > 0 ? maxLeft(m) : 0), m)
}

/** Mostra o item inteiro (foco do teclado), parando no início de um item, como o scroll-snap. */
export function revealTarget(m: Metrics, start: number, size: number, starts: number[]): number {
  if (start < m.left) return clamp(start, m)
  if (start + size <= m.left + m.width) return m.left
  const s = starts.find((x) => x >= start + size - m.width - 1)
  return clamp(s ?? start, m)
}

/** A roda do mouse sobre a faixa: Shift+roda e a roda vertical viram rolagem horizontal. */
export function wheelToX(e: { deltaX: number; deltaY: number; shiftKey?: boolean; deltaMode?: number }): number {
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1 // linhas / páginas → px
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  return d * unit
}

/** Separa "arrastou" de "clicou": passou de DRAG_SLOP px desde que apertou, é arrasto (e não seleciona). */
export class DragGate {
  private x0 = 0
  private y0 = 0
  private down = false
  moved = false
  start(x: number, y: number) { this.x0 = x; this.y0 = y; this.down = true; this.moved = false }
  /** Devolve true quando o gesto já é arrasto. */
  move(x: number, y: number): boolean {
    if (this.down && !this.moved && Math.hypot(x - this.x0, y - this.y0) > DRAG_SLOP) this.moved = true
    return this.moved
  }
  end() { this.down = false }
  get pressing() { return this.down }
  /** O clique que chega depois deste gesto deve virar seleção? (lê e zera) */
  takeClick(): boolean { const ok = !this.moved; this.moved = false; return ok }
}
