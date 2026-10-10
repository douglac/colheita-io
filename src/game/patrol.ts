// Patrulha do cachorro: para onde ele olha em cada instante (de costas para um lote, quase não morde quem pega
// dali). Função pura de (semente, casa, relógio):
// a cena desenha o cachorro com ela e o servidor decide a mordida com ela, sem confiar no cliente.
//
// Um ciclo (PATROL.cycleMs): parado na ponta esquerda → anda para a direita → parado na ponta direita →
// volta. Parado, ele olha para fora; em metade das paradas (sorteio fixo por ciclo) vira no meio da pausa
// para o outro lado ("olha em volta"). Andando, olha para onde anda.
import { PATROL } from './config'
import { pastureBlocked } from './pasture'

export type Facing = -1 | 1 // -1 = olhando para a esquerda da tela, 1 = para a direita
export type PatrolState = { x: number; y: number; facing: Facing; walking: boolean }
export type Spot = { x: number; y: number }

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
const unit = (s: string) => hash(s) / 2 ** 32

/** As duas pontas da patrulha (encurta o passo até o caminho ficar livre de roça, casinha e cerca). */
export function patrolLegs(home: Spot): { left: number; right: number } {
  // A cena pergunta a cada quadro, sempre da mesma casa: guarda a última conta (o resultado é o mesmo).
  if (lastLegs && lastLegs.x === home.x && lastLegs.y === home.y) return lastLegs.legs
  const legs = computeLegs(home)
  lastLegs = { x: home.x, y: home.y, legs }
  return legs
}
let lastLegs: { x: number; y: number; legs: { left: number; right: number } } | null = null

function computeLegs(home: Spot): { left: number; right: number } {
  const free = (dir: -1 | 1) => {
    for (let r = PATROL.reach; r > 0; r -= 5) {
      let ok = true
      for (let d = 0; d <= r && ok; d += 5) if (pastureBlocked(home.x + dir * d, home.y)) ok = false
      if (ok) return home.x + dir * r
    }
    return home.x
  }
  return { left: free(-1), right: free(1) }
}

/** Estado da patrulha no instante `t` (epoch ms). */
export function patrolAt(seed: string, home: Spot, t: number): PatrolState {
  const { left, right } = patrolLegs(home)
  const C = PATROL.cycleMs
  const shifted = t + (hash(seed) % C)
  const k = Math.floor(shifted / C)
  let at = shifted - k * C
  const walk = Math.min(C / 4, ((right - left) / PATROL.speed) * 1000)
  const r = (i: number) => unit(`${seed}:${k}:${i}`)
  const stand1 = (C - 2 * walk) * (0.3 + 0.4 * r(1))
  const stand2 = C - 2 * walk - stand1
  const y = home.y
  // Parado: olha para fora; se o sorteio mandar, vira no meio da pausa.
  const stand = (x: number, out: Facing, len: number, turn: boolean): PatrolState =>
    ({ x, y, facing: turn && at > len / 2 ? (-out as Facing) : out, walking: false })
  if (at < stand1) return stand(left, -1, stand1, r(2) < 0.5)
  at -= stand1
  if (at < walk) return { x: left + ((right - left) * at) / walk, y, facing: 1, walking: true }
  at -= walk
  if (at < stand2) return stand(right, 1, stand2, r(3) < 0.5)
  at -= stand2
  return { x: right - ((right - left) * at) / Math.max(1, walk), y, facing: -1, walking: true }
}

/** O cachorro está de frente ou de costas para um alvo na coordenada x do mundo? */
export function facingTo(p: PatrolState, targetX: number): 'front' | 'back' {
  const dx = targetX - p.x
  if (Math.abs(dx) < PATROL.deadZone) return 'front'
  return Math.sign(dx) === p.facing ? 'front' : 'back'
}

/** Decisão do servidor: de costas agora ou há pouco (atraso da rede a favor do ladrão). */
export function dogLooksAway(seed: string, home: Spot, targetX: number, now: number): boolean {
  return facingTo(patrolAt(seed, home, now), targetX) === 'back'
    || facingTo(patrolAt(seed, home, now - PATROL.graceMs), targetX) === 'back'
}


/** Próximo instante (a partir de `from`) em que o cachorro está de costas (`away`) ou de frente para o alvo,
 *  inclusive na janela de atraso da rede. Usado nos testes e para a cena saber quando ele vira. */
export function nextFacing(seed: string, home: Spot, targetX: number, away: boolean, from: number): number | null {
  for (let t = from; t < from + 2 * PATROL.cycleMs; t += 50) {
    const both = facingTo(patrolAt(seed, home, t), targetX) === 'back' || facingTo(patrolAt(seed, home, t - PATROL.graceMs), targetX) === 'back'
    if (both === away) return t
  }
  return null
}
