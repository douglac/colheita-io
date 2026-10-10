// Bichos trocados de lugar: o servidor valida o ponto, guarda por jogador e só o dono move.
import { beforeEach, describe, expect, it } from 'vitest'

process.env.PGLITE_DIR = 'memory://'
const { getDb } = await import('../src/server/db')
const game = await import('../src/server/game')
const { plotPos } = await import('../src/scene/layout')

const db = await getDb()
let me: string
beforeEach(async () => {
  await game.resetDbForTests()
  me = await game.loginOrCreate('ana')
})

const move = (user: string, animal: string, x: number, y: number, owner?: string) =>
  game.runAction(user, { type: 'move_animal', animal, x, y, ...(owner ? { owner } : {}) })

describe('bichos no lugar escolhido pelo dono', () => {
  it('grama livre: salva e volta no carregamento (e o visitante vê igual)', async () => {
    expect((await game.loadFarm(me)).animals).toEqual({})
    await move(me, 'pig', 330, 300)
    await move(me, 'pig', -60, 200) // mudou de novo: fica o último
    await move(me, 'chicken2', -250, 150)
    expect((await game.loadFarm(me)).animals).toEqual({ pig: { x: -60, y: 200 }, chicken2: { x: -250, y: 150 } })
    const bia = await game.loginOrCreate('bia')
    expect((await game.loadFarm(bia, 'ana')).animals).toEqual({ pig: { x: -60, y: 200 }, chicken2: { x: -250, y: 150 } })
    expect((await game.loadFarm(bia)).animals).toEqual({}) // cada fazenda tem o seu
  })

  it('recusa lote, casa, casinha, cerca e fora da fazenda', async () => {
    const lot = plotPos(0), far = plotPos(23)
    await expect(move(me, 'pig', lot.x, lot.y)).rejects.toThrow(/roça/)
    await expect(move(me, 'pig', Math.round(far.x), Math.round(far.y))).rejects.toThrow(/roça/) // lote ainda não comprado
    await expect(move(me, 'cow', -230, -60)).rejects.toThrow(/casa/)
    await expect(move(me, 'cow', -230, -190)).rejects.toThrow(/casa/) // telhado
    await expect(move(me, 'sheep', 250, -120)).rejects.toThrow(/casinha/)
    await expect(move(me, 'sheep', 346, 209)).rejects.toThrow(/cerca/)
    await expect(move(me, 'pig', 3000, 0)).rejects.toThrow(/Fora da fazenda/)
    await expect(move(me, 'pig', 10.5, 200)).rejects.toThrow(/inválido/)
    await expect(move(me, 'pig', Number.NaN, 200)).rejects.toThrow(/inválido/)
    await expect(move(me, 'unicornio', -60, 200)).rejects.toThrow(/desconhecido/)
    expect((await game.loadFarm(me)).animals).toEqual({})
  })

  it('visitante não move os bichos do dono', async () => {
    const bia = await game.loginOrCreate('bia')
    await expect(move(bia, 'pig', 330, 300, 'ana')).rejects.toThrow(/Só o dono/)
    await move(bia, 'pig', 330, 300) // sem dono = a própria fazenda da bia
    expect((await game.loadFarm(me)).animals).toEqual({})
    expect((await game.loadFarm(bia)).animals).toEqual({ pig: { x: 330, y: 300 } })
  })

  it('cachorro: só com cachorro e só perto da casinha', async () => {
    await expect(move(me, 'dog', 140, -120)).rejects.toThrow(/não tem cachorro/)
    await db.query("update users set dog = 'vira_lata' where id = $1", [me])
    await expect(move(me, 'dog', -250, 150)).rejects.toThrow(/perto da casinha/)
    await move(me, 'dog', 360, -60)
    expect((await game.loadFarm(me)).animals).toEqual({ dog: { x: 360, y: -60 } })
  })

  it('lugar salvo que deixou de valer volta para a área padrão', async () => {
    await db.query("insert into animal_spots (owner_id, animal, x, y) values ($1, 'cow', 70, -60)", [me]) // em cima do lote 0
    expect((await game.loadFarm(me)).animals).toEqual({})
  })
})
