// Vento: balanço sutil das culturas maduras e das árvores (inclina o topo, a base fica parada).
// Com prefers-reduced-motion a cena nem chama update(), então tudo fica parado.
import type { Container } from 'pixi.js'

type Swayer = { node: Container; amp: number; speed: number; phase: number }

export class Wind {
  private list: Swayer[] = []

  /** amp em radianos de inclinação (0.03 ≈ 1,7°). O pivô do nó deve estar na base. */
  add(node: Container, amp = 0.03, speed = 1.4) {
    // Lote redesenhado destrói o sprite antigo: limpa aqui também (no modo calmo update() nem roda).
    this.list = this.list.filter((s) => !s.node.destroyed)
    this.list.push({ node, amp, speed, phase: node.x * 0.013 + node.y * 0.007 + Math.random() })
  }

  update(secs: number) {
    if (this.list.some((s) => s.node.destroyed)) this.list = this.list.filter((s) => !s.node.destroyed)
    // Rajada lenta que passa pela fazenda (a fase depende da posição): parece vento, não metrônomo.
    const gust = 0.6 + 0.4 * Math.sin(secs * 0.35)
    for (const s of this.list) s.node.skew.x = Math.sin(secs * s.speed + s.phase) * s.amp * gust
  }
}
