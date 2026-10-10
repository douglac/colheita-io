import { describe, expect, it } from 'vitest'
import { allow } from '../src/server/ratelimit'

describe('limite de ritmo', () => {
  it('deixa a rajada passar, bloqueia o excesso e repõe com o tempo', () => {
    const t = 1_000_000
    for (let i = 0; i < 20; i++) expect(allow('k', 20, 1, t)).toBe(true)
    expect(allow('k', 20, 1, t)).toBe(false)
    expect(allow('k', 20, 1, t + 1000)).toBe(true)
  })
})
