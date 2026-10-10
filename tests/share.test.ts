// Convidar amigos sem o menu nativo de compartilhar (Chrome do Mac na prévia de 09/10): copia o link /c/<código>
// e a página mostra "Link copiado!" com o botão do WhatsApp.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { share, whatsappLink } from '../src/game/share'

const link = 'https://colheita.example/c/abc123'
const stub = (nav: Record<string, unknown>) => {
  vi.stubGlobal('navigator', nav)
  vi.stubGlobal('document', { title: 'Colheita Feliz' })
}
afterEach(() => { vi.unstubAllGlobals() })

describe('compartilhar o convite', () => {
  it('sem navigator.share: copia o link e avisa', async () => {
    const writeText = vi.fn(async () => {})
    stub({ clipboard: { writeText } })
    expect(await share('Bora jogar?', link)).toBe('copied')
    expect(writeText).toHaveBeenCalledWith(link)
  })

  it('menu nativo que falha (não é cancelamento): também copia', async () => {
    const writeText = vi.fn(async () => {})
    stub({ share: vi.fn(async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }) }), clipboard: { writeText } })
    expect(await share('Bora jogar?', link)).toBe('copied')
    expect(writeText).toHaveBeenCalledWith(link)
  })

  it('canShare recusa os dados: copia', async () => {
    const share_ = vi.fn()
    stub({ share: share_, canShare: () => false, clipboard: { writeText: async () => {} } })
    expect(await share('Bora jogar?', link)).toBe('copied')
    expect(share_).not.toHaveBeenCalled()
  })

  it('quem fecha o menu nativo não ganha aviso nem cópia', async () => {
    const writeText = vi.fn(async () => {})
    stub({ share: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }) }, clipboard: { writeText } })
    expect(await share('Bora jogar?', link)).toBe('cancelled')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('menu nativo funcionando: compartilha com o link', async () => {
    const native = vi.fn(async () => {})
    stub({ share: native, canShare: () => true })
    expect(await share('Bora jogar?', link)).toBe('shared')
    expect(native).toHaveBeenCalledWith({ title: 'Colheita Feliz', text: 'Bora jogar?', url: link })
  })

  it('nem a área de transferência funciona: failed (a página ainda oferece o WhatsApp)', async () => {
    stub({ clipboard: { writeText: async () => { throw new Error('negado') } } })
    expect(await share('Bora jogar?', link)).toBe('failed')
  })

  it('área de transferência que nunca responde (aba fora de foco): não trava, a página oferece o WhatsApp', async () => {
    vi.useFakeTimers()
    stub({ share: async () => { throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }) }, clipboard: { writeText: () => new Promise(() => {}) } })
    const r = share('Bora jogar?', link)
    await vi.advanceTimersByTimeAsync(1600)
    expect(await r).toBe('failed')
    vi.useRealTimers()
  })

  it('botão do WhatsApp leva texto e link', () => {
    expect(whatsappLink('Bora jogar?', link)).toBe(`https://wa.me/?text=${encodeURIComponent(`Bora jogar? ${link}`)}`)
  })
})
