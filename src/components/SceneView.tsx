'use client'
import { useEffect, useRef, useState } from 'react'
import type { FarmScene, SceneDog, SceneLooks, ScenePlot } from '@/scene/FarmScene'
import type { AnimalId, Spots } from '@/game/pasture'
import type { DecorEvent, SceneEdit } from '@/scene/decor-layer'
import type { DecorView } from '@/server/decor'
import type { SceneEvent } from '@/scene/event-layer'

/** O que a página pede à cena: posição de um lote na tela e as falas/efeitos em cima dele. */
export type SceneApi = {
  plotPoint: (idx: number) => { x: number; y: number } | null // coordenadas da página
  sayAt: (idx: number, text: string) => void
  bite: (idx: number, text: string) => void
  chestAt: (idx: number) => void // baú do tesouro achado ao cavar: sobe fechado e abre em cima do lote
  zoom: (dir: 1 | -1) => void // botões + e −: aproxima/afasta pelo centro da tela
  animalPoint: (id: AnimalId) => { x: number; y: number } | null // em cima do bicho, coordenadas da página
  sayAnimal: (id: AnimalId, text: string) => void // balão de gibi em cima do bicho
  biteAnimal: (id: AnimalId, text: string) => void // o cachorro corre até o bicho que o ladrão tentou pegar
  shooCritter: (n: number) => void // evento: o visitante espantado fala e some
  bowlPoint: () => { x: number; y: number } | null // evento: em cima da tigela, coordenadas da página
}

type Props = {
  apiRef?: React.MutableRefObject<SceneApi | null>
  plots: ScenePlot[]
  visiting: boolean
  farm?: string // de quem é a fazenda: trocar de fazenda não dispara partículas nos lotes
  dog: SceneDog
  animals: Spots // onde o dono deixou os bichos
  herd?: AnimalId[] // bichos do dono (sem isto: o rebanho de sempre)
  looks?: SceneLooks // idade do desenho e acessórios de cada bicho
  onAnimalTap?: (id: AnimalId) => boolean // true = a página tratou o toque (não cutuca)
  onAnimalHover?: (id: AnimalId | null, x: number, y: number) => void // x/y em coordenadas da página
  onAnimalMove?: (id: AnimalId, x: number, y: number) => void // só na própria fazenda
  decor: DecorView // decoração da fazenda na tela (peças das séries e enfeites/caminhos)
  edit: SceneEdit // modo edição (martelo); null = fora
  onDecor: (ev: DecorEvent) => void
  cursor?: string // valor CSS de cursor da ferramenta ativa
  pressedCursor?: string // o mesmo, com o botão/dedo pressionado
  onTap: (idx: number) => void
  onHover: (idx: number | null, x: number, y: number) => void // x/y em coordenadas da página
  onDogTap: () => void
  onPointer: (x: number, y: number) => void // último toque (para os números flutuantes)
  event?: SceneEvent // evento sazonal: tigela de doces e visitantes (Evolução 09)
  onBowlTap?: () => void
  onCritterTap?: (n: number) => void
  onPropTap?: (id: 'build' | 'help' | 'npc') => void
  onShown?: () => void // primeiro quadro com a fazenda desenhada
  vitrine?: boolean // página inicial: só a câmera anda (arrastar, pinça, roda); objetos sem toque, hover, cursor nem som
}

export function SceneView({ apiRef, plots, visiting, farm, dog, animals, herd, looks, onAnimalTap, onAnimalHover, onAnimalMove, decor, edit, onDecor, cursor, pressedCursor, onTap, onHover, onDogTap, onPointer, event = null, onBowlTap, onCritterTap, onPropTap, onShown, vitrine }: Props) {
  // Retorno do clique: cursor "apertado", mão de agarrar no arraste e um anel no ponto tocado.
  const [press, setPress] = useState<'up' | 'down' | 'drag'>('up')
  const [rings, setRings] = useState<{ id: number; x: number; y: number }[]>([])
  const downAt = useRef<{ x: number; y: number } | null>(null)
  const ringId = useRef(0)
  const el = useRef<HTMLDivElement>(null)
  const scene = useRef<FarmScene | null>(null)
  const cb = useRef({ onTap, onHover, onDogTap, onAnimalMove, onAnimalTap, onAnimalHover, onDecor, onBowlTap, onCritterTap, onPropTap, onShown })
  cb.current = { onTap, onHover, onDogTap, onAnimalMove, onAnimalTap, onAnimalHover, onDecor, onBowlTap, onCritterTap, onPropTap, onShown }

  useEffect(() => {
    let s: FarmScene | null = null
    let cancelled = false
    let stopMeasure = () => {}
    // Pixi só roda no navegador: import dinâmico evita SSR.
    import('@/scene/FarmScene').then(({ FarmScene }) => {
      if (cancelled || !el.current) return
      s = new FarmScene()
      s.objectInput = !vitrine
      s.onPlotTap = (idx) => cb.current.onTap(idx)
      s.onDogTap = () => cb.current.onDogTap()
      if (!vitrine) s.onAnimalSfx = (kind, act, breed) => void import('@/game/sfx').then((m) => m.playAnimal(kind, act, breed))
      s.onAnimalMove = (id, x, y) => cb.current.onAnimalMove?.(id, x, y)
      s.onDecor = (ev) => cb.current.onDecor(ev)
      s.onAnimalTap = (id) => cb.current.onAnimalTap?.(id) ?? false
      s.onBowlTap = () => cb.current.onBowlTap?.()
      s.onCritterTap = (n) => cb.current.onCritterTap?.(n)
      s.onPropTap = (id) => cb.current.onPropTap?.(id)
      s.onShown = () => cb.current.onShown?.()
      s.onAnimalHover = (id, x, y) => {
        const r = el.current?.getBoundingClientRect()
        cb.current.onAnimalHover?.(id, (r?.left ?? 0) + x, (r?.top ?? 0) + y)
      }
      s.onPlotHover = (idx, x, y) => {
        const r = el.current?.getBoundingClientRect()
        cb.current.onHover(idx, (r?.left ?? 0) + x, (r?.top ?? 0) + y)
      }
      scene.current = s
      // Entrega já o estado atual: com a arte em cache a cena fica pronta antes do próximo render (o relógio, 1×/s)
      // e a roça ficava até 1 s sem desenho (toque perdido logo ao entrar numa visita).
      push.current(s)
      if (apiRef) {
        apiRef.current = {
          plotPoint: (idx) => {
            const p = s?.plotPoint(idx), r = el.current?.getBoundingClientRect()
            return p && r ? { x: r.left + p.x, y: r.top + p.y } : null
          },
          sayAt: (idx, text) => s?.sayAt(idx, text),
          animalPoint: (id) => {
            const p = s?.animalPoint(id), r = el.current?.getBoundingClientRect()
            return p && r ? { x: r.left + p.x, y: r.top + p.y } : null
          },
          sayAnimal: (id, text) => s?.sayAnimal(id, text),
          biteAnimal: (id, text) => s?.biteAnimal(id, text),
          bite: (idx, text) => s?.bite(idx, text),
          chestAt: (idx) => s?.chestAt(idx),
          shooCritter: (n) => s?.shooCritter(n),
          bowlPoint: () => {
            const p = s?.bowlPoint(), r = el.current?.getBoundingClientRect()
            return p && r ? { x: r.left + p.x, y: r.top + p.y } : null
          },
          // Usa o mesmo caminho da roda do mouse (zoom em torno do ponto, com os limites da cena): dois passos por toque.
          zoom: (dir) => {
            const canvas = el.current?.querySelector('canvas'), r = canvas?.getBoundingClientRect()
            if (!canvas || !r) return
            const at = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, deltaY: -dir * 100, cancelable: true }
            for (let i = 0; i < 2; i++) canvas.dispatchEvent(new WheelEvent('wheel', at))
          },
        }
      }
      // QA (só em desenvolvimento): a cena fica acessível no console para medir posições na tela.
      if (process.env.NODE_ENV === 'development') (window as unknown as { __cfScene?: FarmScene }).__cfScene = s
      // Testes de ponta a ponta (e2e/, também no build de produção): onde fica cada lote na tela. Só leitura,
      // e o servidor confere toda ação, então não ajuda a trapacear.
      ;(window as unknown as { __cfPlotPoint?: (idx: number) => { x: number; y: number } | null }).__cfPlotPoint = (idx) => {
        const p = s?.plotCenter(idx), r = el.current?.getBoundingClientRect()
        return p && r ? { x: r.left + p.x, y: r.top + p.y } : null
      }
      void s.mount(el.current)
      // Topo livre da cena: mede a HUD, o Assistente e a faixa da visita (crescem e somem conforme o jogo).
      const measure = () => {
        const box = el.current?.getBoundingClientRect()
        if (!box || !s) return
        let bottom = 0
        for (const sel of ['.hud', '.assist', '.visit']) {
          const r = document.querySelector(sel)?.getBoundingClientRect()
          if (r && r.height > 0 && r.top < box.top + box.height / 3) bottom = Math.max(bottom, r.bottom - box.top)
        }
        s.setTopInset(bottom + 8)
      }
      let raf = 0
      const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure) }
      const game = el.current.closest('.game') ?? document.body
      const mo = new MutationObserver(later)
      mo.observe(game, { childList: true, subtree: true })
      window.addEventListener('resize', later)
      later()
      stopMeasure = () => { mo.disconnect(); window.removeEventListener('resize', later); cancelAnimationFrame(raf) }
    })
    return () => {
      cancelled = true
      stopMeasure()
      s?.destroy()
      scene.current = null
      if (apiRef) apiRef.current = null
    }
  }, [])

  // A cena guarda o que já desenhou: chamar a cada render é barato (e cobre a montagem assíncrona).
  const push = useRef((sc: FarmScene) => { void sc })
  push.current = (sc: FarmScene) => {
    sc.setPlots(plots, visiting, farm)
    sc.setDog(dog)
    if (herd) sc.setHerd(herd)
    if (looks) sc.setLooks(looks)
    sc.setAnimals(animals, !visiting && !!onAnimalMove)
    sc.setDecor(decor.slots, decor.placed)
    sc.setEdit(edit)
    sc.setEvent(event)
  }
  useEffect(() => { if (scene.current) push.current(scene.current) })

  const activeCursor = vitrine ? undefined : press === 'drag' ? 'grabbing' : press === 'down' ? (pressedCursor ?? cursor) : cursor
  return (
    <div
      ref={el}
      className="scene"
      data-testid="scene"
      data-vitrine={vitrine ? 'on' : undefined}
      // Pixi define o cursor no canvas; a ferramenta ativa ganha com !important no CSS (.scene.tool canvas).
      style={activeCursor ? ({ '--tool-cursor': activeCursor } as React.CSSProperties) : undefined}
      data-tool={activeCursor ? 'on' : undefined}
      onPointerDown={(e) => {
        if (vitrine) return // sem anel nem cursor apertado: tocar na prévia não "faz" nada
        onPointer(e.clientX, e.clientY)
        downAt.current = { x: e.clientX, y: e.clientY }
        setPress('down')
        const id = ++ringId.current
        setRings((r) => [...r, { id, x: e.clientX, y: e.clientY }])
        setTimeout(() => setRings((r) => r.filter((q) => q.id !== id)), 450)
      }}
      onPointerMove={(e) => {
        const d = downAt.current
        if (d && press !== 'drag' && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) setPress('drag')
      }}
      onPointerUp={() => { downAt.current = null; setPress('up') }}
      onPointerCancel={() => { downAt.current = null; setPress('up') }}
      onPointerLeave={(e) => {
        downAt.current = null; setPress('up')
        // Mouse saiu da cena (para a barra, a HUD ou fora da janela): o balão do lote não fica preso.
        // No toque, o pointerleave vem ao levantar o dedo: o balão do toque longo tem o tempo dele.
        if (e.pointerType === 'mouse') { cb.current.onHover(null, 0, 0); cb.current.onAnimalHover?.(null, 0, 0) }
      }}
    >
      {rings.map((r) => <span key={r.id} className="tap-ring" style={{ left: r.x, top: r.y }} aria-hidden />)}
    </div>
  )
}
