// Assistente (ícone que avisa o estado das plantações, no canto superior
// esquerdo): na própria fazenda, um resumo do que pede atenção. Cada aviso sabe qual ferramenta resolve.
import type { PlotView } from './rules'

export type AssistTool = 'hand' | 'water' | 'pesticide' | 'herbicide' | 'hoe' | 'dog' | 'feed'
export type AssistItem = { key: string; icon: string; text: string; tool: AssistTool; n: number }

type AnimalLike = { ready: boolean; hungry: boolean }
type DogLike = { awake: boolean } | null

const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`

/** Avisos em ordem de urgência: colher antes que roubem, depois cuidar, depois o resto. */
export function assistant(plots: PlotView[], animals: AnimalLike[] = [], dog: DogLike = null): AssistItem[] {
  const count = (f: (p: PlotView) => boolean) => plots.filter(f).length
  const growing = (p: PlotView) => p.state === 'growing'
  const out: AssistItem[] = []
  const push = (key: string, icon: string, k: number, text: string, tool: AssistTool) => { if (k > 0) out.push({ key, icon, text, tool, n: k }) }
  push('ripe', '🧺', count((p) => p.state === 'ripe'), '', 'hand')
  push('animals', '🥚', animals.filter((a) => a.ready).length, '', 'hand')
  push('dry', '💧', count((p) => growing(p) && !!p.dry), '', 'water')
  push('pests', '🐛', count((p) => growing(p) && (p.pests ?? 0) > 0), '', 'pesticide')
  push('weeds', '🌿', count((p) => growing(p) && (p.weeds ?? 0) > 0), '', 'herbicide')
  push('withered', '🥀', count((p) => p.state === 'withered'), '', 'hoe')
  push('hungry', '🌾', animals.filter((a) => a.hungry).length, '', 'feed')
  if (dog && !dog.awake) push('dog', '💤', 1, '', 'dog')
  const TEXT: Record<string, (k: number) => string> = {
    ripe: (k) => `${n(k, 'lote maduro', 'lotes maduros')}`,
    animals: (k) => `${n(k, 'bicho com produto', 'bichos com produto')}`,
    dry: (k) => `${n(k, 'lote seco', 'lotes secos')}`,
    pests: (k) => `${n(k, 'lote com praga', 'lotes com praga')}`,
    weeds: (k) => `${n(k, 'lote com erva', 'lotes com erva')}`,
    withered: (k) => `${n(k, 'planta seca', 'plantas secas')} para limpar`,
    hungry: (k) => `${n(k, 'bicho com fome', 'bichos com fome')}`,
    dog: () => 'cachorro sem ração',
  }
  return out.map((i) => ({ ...i, text: TEXT[i.key](i.n) }))
}
