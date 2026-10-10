// Barra de ferramentas: seta, enxada, saco de sementes, regador,
// tira-pragas (o tubo verde) e só depois
// tira-ervas, mão. Na fazenda do amigo, enxada e saco dão lugar a jogar praga e erva.
export type ToolId = 'arrow' | 'hoe' | 'bag' | 'water' | 'herbicide' | 'pesticide' | 'hand' | 'pest' | 'weed' | 'seed' | 'fertilizer' | 'love' | 'feed'

export type Tool = {
  id: ToolId
  name: string // tooltip
  icon: string // public/art/ui/<icon>.png
  emoji: string // fallback enquanto a arte não chega
  hotspot: [number, number] // ponto ativo do cursor 64×64 (medido na ponta da ferramenta)
}

export const TOOLS: Record<ToolId, Tool> = {
  arrow: { id: 'arrow', name: 'Seta: toque no lote para a ação certa', icon: 'tool_arrow', emoji: '👆', hotspot: [6, 3] },
  hoe: { id: 'hoe', name: 'Enxada: limpar planta seca', icon: 'tool_hoe', emoji: '⛏️', hotspot: [6, 50] },
  bag: { id: 'bag', name: 'Seus pertences: sementes e itens', icon: 'tool_seed', emoji: '🎒', hotspot: [37, 60] },
  water: { id: 'water', name: 'Regador: molhar terra seca', icon: 'tool_water', emoji: '🚿', hotspot: [3, 32] },
  herbicide: { id: 'herbicide', name: 'Tira-ervas: arrancar erva daninha', icon: 'tool_herbicide', emoji: '🌿', hotspot: [56, 52] },
  pesticide: { id: 'pesticide', name: 'Tira-pragas: borrifar inseticida', icon: 'tool_pesticide', emoji: '🧴', hotspot: [3, 27] },
  hand: { id: 'hand', name: 'Mão: colher (ou pegar da horta do amigo)', icon: 'tool_hand', emoji: '✋', hotspot: [10, 27] },
  pest: { id: 'pest', name: 'Soltar praga na horta do amigo', icon: 'tool_pest', emoji: '🐛', hotspot: [5, 7] },
  weed: { id: 'weed', name: 'Plantar erva daninha na horta do amigo', icon: 'tool_weed', emoji: '🌱', hotspot: [32, 59] },
  seed: { id: 'seed', name: 'Plantar', icon: 'tool_seed', emoji: '🌰', hotspot: [37, 60] },
  fertilizer: { id: 'fertilizer', name: 'Adubar: pula o resto do estágio', icon: 'tool_fertilizer', emoji: '🧪', hotspot: [48, 60] },
  love: { id: 'love', name: 'Fertilizante do Amor: grátis, 1 por dia, adianta a horta do amigo', icon: 'tool_love', emoji: '💚', hotspot: [32, 60] }, // vidrinho de coração (lote Q, A7)
  feed: { id: 'feed', name: 'Ração: toque no bicho para alimentar', icon: 'dog_food', emoji: '🌾', hotspot: [32, 50] },
}

export const OWN_BAR: ToolId[] = ['arrow', 'hoe', 'bag', 'water', 'pesticide', 'herbicide', 'hand']
export const VISIT_BAR: ToolId[] = ['arrow', 'pest', 'weed', 'water', 'pesticide', 'herbicide', 'love', 'hand']

// Ferramenta ativa: as de "saco" carregam o que foi escolhido em Seus pertences.
export type ActiveTool = { id: Exclude<ToolId, 'bag'>; seedId?: string; itemId?: string }

/** Valor CSS do cursor: a própria ferramenta seguindo o mouse.
 *  Apertado: a ferramenta inclina agindo (regador derrama, enxada bate); a mão fecha pegando. */
export function toolCursor(t: ActiveTool, visiting: boolean, pressed = false): string | undefined {
  if (t.id === 'arrow') return undefined
  // Na horta do amigo a mão vira a "mão marota".
  const [base, [x, y]] = t.id === 'hand' && visiting ? ['tool_steal', [10, 27]] : [TOOLS[t.id].icon, TOOLS[t.id].hotspot]
  const icon = pressed ? `${base}_down` : base
  return `url(/art/cursor/${icon}.png) ${x} ${y}, pointer`
}
