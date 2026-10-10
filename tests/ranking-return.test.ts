import { describe, expect, it } from 'vitest'
import { rankingReturn } from '../src/game/vitrine-text'

describe('retorno da prévia ao ranking', () => {
  it.each(['/fazenda?ranking=nivel', '/fazenda/amigo_1?ranking=moedas', '/fazenda/amigo_2?ranking=popularidade'])('aceita o contexto local %s', (path) => {
    expect(rankingReturn(path)).toBe(path)
  })
  it.each([undefined, null, '/fazenda?ranking=nivel\n', '/fazenda?ranking=nivel\r', ['/fazenda?ranking=nivel'], '//example.com?ranking=nivel', 'https://example.com/fazenda?ranking=nivel', 'javascript:alert(1)', '/fazenda/../conta?ranking=nivel', '/fazenda?ranking=global', '/fazenda?ranking=nivel&next=https://example.com', '/fazenda?ranking=nivel#outro', '/fazenda/a%2fb?ranking=nivel'])('recusa destino fora do ranking: %j', (path) => {
    expect(rankingReturn(path)).toBeNull()
  })
})
