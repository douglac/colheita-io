// Release candidate (frente S): o que só aparecia na imagem Docker de produção.
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('variáveis de build vazias', () => {
  it('nome do jogo e velocidade não somem quando o Dockerfile passa o build arg vazio', async () => {
    vi.stubEnv('NEXT_PUBLIC_GAME_NAME', '')
    vi.stubEnv('GROWTH_SPEED', '')
    vi.resetModules()
    const cfg = await import('../src/game/config')
    expect(cfg.GAME_NAME).toBe('Colheita Feliz')
    expect(cfg.GROWTH_SPEED).toBe(1)
  })

  it('o nome escolhido no build continua valendo', async () => {
    vi.stubEnv('NEXT_PUBLIC_GAME_NAME', 'Roça Feliz')
    vi.resetModules()
    expect((await import('../src/game/config')).GAME_NAME).toBe('Roça Feliz')
  })
})
