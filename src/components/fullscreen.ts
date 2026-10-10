// Tela cheia (botão do canto). Só onde o navegador deixa: o iPhone não deixa.
type Doc = Pick<Document, 'fullscreenEnabled' | 'fullscreenElement' | 'exitFullscreen'> & { documentElement: Pick<HTMLElement, 'requestFullscreen'> }

export const canFullscreen = (doc: Doc | undefined): boolean => !!doc?.fullscreenEnabled && typeof doc.documentElement?.requestFullscreen === 'function'

/** Entra ou sai da tela cheia; devolve se ficou em tela cheia. Recusa do navegador não quebra o jogo. */
export async function toggleFullscreen(doc: Doc): Promise<boolean> {
  try {
    if (doc.fullscreenElement) { await doc.exitFullscreen(); return false }
    await doc.documentElement.requestFullscreen({ navigationUI: 'hide' })
    return true
  } catch {
    return !!doc.fullscreenElement
  }
}
