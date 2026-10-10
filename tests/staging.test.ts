// Servidor de teste fechado (Fly): faixa "versão de teste" e entrada da imagem Docker.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isStaging } from '../src/game/config'

describe('staging', () => {
  it('a faixa "versão de teste" só aparece com APP_ENV=staging', () => {
    expect(isStaging('staging')).toBe(true)
    for (const env of [undefined, '', 'production', 'prod-local']) expect(isStaging(env)).toBe(false)
  })

  it('a imagem acerta o dono do volume do PGlite e roda o app sem root', () => {
    const docker = readFileSync('Dockerfile', 'utf8')
    expect(docker).toMatch(/su-exec/)
    expect(docker).toMatch(/ENTRYPOINT \["\/sbin\/tini", "--", "cf-entrypoint"\]/)
    const entry = readFileSync('scripts/docker/entrypoint.sh', 'utf8')
    expect(entry).toMatch(/chown node:node/)
    expect(entry).toMatch(/exec su-exec node "\$@"/)
  })

})
