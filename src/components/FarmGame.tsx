'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react'
import { fmtGold, itemIcon, itemName, SEED_BY_ID, seedItem, sellPriceOf, stageFracs, type ShopTab } from '@/game/catalog'
import { COMMUNITY_URL, GAME_NAME, INVITE, POPULARITY_CAP } from '@/game/config'
import { decorName, SERIES_BY_ID } from '@/game/decor'
import { BITE_LINES, HUD_TIPS, isPlotLine, PLOT_LINES } from '@/game/lines'
import { levelForXp, popLevelFor, popToReach, stageAt, xpToReach, type PlotView } from '@/game/rules'
import { isNightBrasilia, play, prefs, prepareAudio, setMusicMode, setPrefs, setSoundUser, unlock, type Prefs, type Sfx } from '@/game/sfx'
import { disablePush, enablePush, isSubscribed, pushState, registerSW, type PushState } from '@/game/push-client'
import { inviteLink, levelUpLink, levelUpShareText, noteShare, nostalgic, share, shareOnce, whatsappLink } from '@/game/share'
import type { SharePlace } from '@/server/metrics'
import { toolCursor, type ActiveTool, type ToolId } from '@/game/tools'
import type { SceneLooks, ScenePlot } from '@/scene/FarmScene'
import type { AnimalId } from '@/game/pasture'
import type { FarmPayload, SaleView } from '@/server/game'
import {
  AnimalDialog, BarnDialog, MeatConfirmDialog, DailyBonusDialog, DogDialog, ExpandDialog, FriendsDialog, GiftsDialog, LevelUpDialog, MissionsDialog, NoSeedDialog, ShopDialog,
} from './Dialogs'
import { FxLayer, PlotTip, type Fx } from './PlotTip'
import { AnimalTip } from './AnimalTip'
import { CoachBubble, useCoach } from './Coach'
import { SceneView, type SceneApi } from './SceneView'
import { FruitLayer, type Fruit } from './FruitFx'
import { GoldShopDialog } from './GoldShop'
import { HScroll } from './HScroll'
import { VisitLoading } from './VisitLoading'
import { DecorEditBar, type DecorEditState } from './DecorEdit'
import { canFullscreen, toggleFullscreen } from './fullscreen'
import type { DecorEvent } from '@/scene/decor-layer'
import type { Placed } from '@/game/decor-grid'
import { AwayDialog, HelpDialog, MuralDialog } from './Mural'
import { EventDialog, type EventTab } from './EventDialog'
import type { SceneEvent, SceneProp } from '@/scene/event-layer'
import { buildSrc, helpSrc } from '@/game/events'
import { assistant, type AssistItem } from '@/game/assistant'
import { awaySummary, awayWorthShowing, lastId, unseenCount } from '@/game/away'
import { BagStrip, bagItemTool, Toolbar } from './Toolbar'
import { Dialog } from './ui/Dialog'
import { Avatar } from './Avatar'
import { Icon } from './ui/Icon'
import { SoundControls } from './SoundControls'

type Panel = null | 'event' | 'away' | 'help' | 'animal' | 'shop' | 'barn' | 'missions' | 'feed' | 'expand' | 'dog' | 'friends' | 'gifts' | 'noseed' | 'more' | 'gold' | 'sound'
type ActionFx = { xp?: number; gold?: number; item?: string; qty?: number }
type ActionJson = {
  message?: string; error?: string; code?: string; bad?: boolean; fx?: ActionFx; readyAt?: number
  say?: string; chest?: number; bite?: { idx: number; gold: number; breed: string; owner: string; slot?: string }; sale?: SaleView; away?: boolean; gone?: string
}
const ARROW: ActiveTool = { id: 'arrow' }
/** Ícone do aviso sem arquivo: cai na moeda (que sempre existe). */
const toastIconFallback = (e: SyntheticEvent<HTMLImageElement>) => {
  if (!e.currentTarget.src.endsWith('/art/ui/coin.png')) e.currentTarget.src = '/art/ui/coin.png'
}
const CHEST_ICON = '/art/ui/bau_aberto.png' // lote W (A6); a cena mostra o baú fechado abrindo em cima do lote

// Som de cada ação que deu certo.
const ACTION_SFX: Record<string, Sfx> = {
  plant: 'plant', harvest: 'harvest', give_flower: 'flower', clear: 'dig', sell: 'sell', sell_all: 'sell', steal: 'steal', buy: 'buy',
  sabotage: 'pest', fertilize: 'fertilize', love: 'love', feed_dog: 'feed_dog', expand: 'expand', claim: 'claim', gift: 'gift',
  thank: 'thank', add_friend: 'friend', feed_animal: 'feed', collect_animal: 'collect', steal_animal: 'steal', give_bone: 'feed_dog', wear: 'click',
  decor_buy: 'buy', decor_buy_set: 'buy',
  event_take: 'steal', event_fill: 'buy', event_trade: 'buy', event_claim: 'claim', event_prize: 'claim', event_shoo: 'click',
  event_build_give: 'gift', event_build_up: 'expand', event_gift_hang: 'gift', event_gift_open: 'claim', event_help: 'love', event_help_claim: 'claim',
  event_checkin: 'click', event_checkin_recover: 'buy', event_craft: 'click', event_craft_collect: 'collect', event_open_egg: 'claim', event_send: 'gift',
}
const CARE_SFX: Record<string, Sfx> = { water: 'water', pesticide: 'spray', herbicide: 'pull' }

function eventText(e: FarmPayload['events'][number]) {
  const who = e.actor ?? 'Alguém'
  const seed = SEED_BY_ID[String(e.payload.seedId)]
  switch (e.kind) {
    case 'stolen': return e.payload.slot
      ? `${who} pegou ${e.payload.qty} ${itemName(String(e.payload.item))} dos seus bichos`
      : `${who} pegou ${e.payload.qty} ${seed?.name ?? ''} da sua horta`
    case 'level_up': return `Você subiu para o nível ${e.payload.level}!`
    case 'helped': return `${who} ${e.payload.tool === 'water' ? 'regou' : e.payload.tool === 'pesticide' ? 'tirou uma praga de' : 'tirou erva daninha de'} um lote seu`
    case 'sabotaged': return `${who} ${e.payload.kind === 'pest' ? 'soltou uma praga' : 'plantou erva daninha'} na sua horta`
    case 'bitten': return `${BITE_LINES.ownerTitle(who)} +${e.payload.gold} de ouro`
    case 'gift': return `${who} te mandou 1 semente de ${seed?.name ?? ''} de presente`
    case 'thanked': return `${who} agradeceu o seu presente (semente de ${seed?.name ?? ''}) 💐`
    case 'friend_joined': return `${who} entrou pelo seu convite: +${e.payload.gold} de ouro${e.payload.dog ? ' e um Vira-lata!' : ''}`
    case 'friend_added': return `${who} te adicionou como amigo`
    case 'share_xp': return `Você abriu o nível ${e.payload.level} de ${who}: +${e.payload.xp} XP`
    case 'share_seen': return `${who} viu seu nível ${e.payload.level} e ganhou XP com o seu link`
    case 'dog_hungry': return e.payload.hours ? `Seu ${e.payload.breed} está com fome: a ração acaba em ${e.payload.hours} h` : `A ração acabou: seu ${e.payload.breed} dormiu e não guarda a horta`
    case 'dog_leaving': return `Seu ${e.payload.breed} vai embora em ${e.payload.hours} h (fim do prazo)`
    case 'dog_left': return `Seu ${e.payload.breed} foi embora: o prazo acabou`
    case 'flower': return `${who} te deu uma flor de ${seed?.name ?? ''}: +${e.payload.charm ?? 1} de popularidade`
    case 'visited': return `${who} passou pela sua fazenda`
    case 'bought': return `Você comprou ${e.payload.qty} × ${itemName(String(e.payload.itemId))} por ${fmtGold(Number(e.payload.gold))} de ouro`
    case 'sold': return `Você vendeu ${e.payload.count} itens por ${fmtGold(Number(e.payload.gold))} de ouro`
    case 'gold_bought': return `Você comprou ${Number(e.payload.gold).toLocaleString('pt-BR')} moedas de ouro`
    case 'gold_refunded': return `Compra estornada: −${Number(e.payload.gold).toLocaleString('pt-BR')} de ouro`
    case 'gold_adjusted': return `O suporte ajustou seu ouro em ${Number(e.payload.gold).toLocaleString('pt-BR')}`
    case 'loved': return `${who} adubou sua horta com carinho 💚`
    case 'decor_bought': return e.payload.series
      ? `Você decorou a fazenda com a série ${SERIES_BY_ID[String(e.payload.series)]?.name ?? ''} por ${fmtGold(Number(e.payload.gold))} de ouro`
      : `Você comprou ${e.payload.qty ? `${e.payload.qty} × ` : ''}${decorName(String(e.payload.itemId))} por ${fmtGold(Number(e.payload.gold))} de ouro`
    case 'bowl_taken': return `${who} pegou um doce da sua tigela 🍬${e.payload.left ? '' : ' e ela esvaziou: toque na tigela para pegar o prêmio!'}`
    case 'event_material': return `${who} mandou ${e.payload.qty ?? 1} × ${itemName(String(e.payload.item))} para a sua árvore 🎄`
    case 'event_gift': return `${who} pendurou um presente na sua árvore 🎁 (abre no Natal)`
    case 'event_help': return `${who} ajudou no seu evento 🤝 (${e.payload.helps}/${e.payload.friends})`
    case 'event_card': return `${who} te mandou ${String(e.payload.name ?? '').toLowerCase()} 💌${Number(e.payload.charm) > 0 ? ` +${e.payload.charm} de popularidade` : ''}`
    case 'event_free_series': return `Presente do evento: a série de decoração ${SERIES_BY_ID[String(e.payload.series)]?.name ?? ''} está no seu depósito 🎉`
    case 'friend_ripe': return `A horta de ${who} ficou madura (${e.payload.plots} ${Number(e.payload.plots) > 1 ? 'lotes' : 'lote'}). Corre lá! 🧺`
    default: return e.kind
  }
}

export function FarmGame({ owner }: { owner?: string }) {
  const router = useRouter()
  const [data, setData] = useState<FarmPayload | null>(null)
  const [offset, setOffset] = useState(0) // serverNow - Date.now()
  const [now, setNow] = useState(() => Date.now())
  const [panel, setPanel] = useState<Panel>(null)
  const [eventTab, setEventTab] = useState<EventTab | undefined>(undefined)
  // Volta do pagamento por cartão (/fazenda?pedido=ord_…): reabre a loja de ouro acompanhando o pedido.
  const [payOrder, setPayOrder] = useState<string | null>(null)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('pedido')
    if (!id) return
    setPayOrder(id)
    setPanel('gold')
    window.history.replaceState(null, '', window.location.pathname)
  }, [])
  // Semente que faltou (janela "Quer comprar?") e item em que a loja abre; amigo escolhido para o presente.
  const [want, setWant] = useState<{ seedId?: string; shopAt?: string; shopTab?: ShopTab; giftTo?: string }>({})
  const [tool, setTool] = useState<ActiveTool>(ARROW)
  const [bagOpen, setBagOpen] = useState(false)
  const [plantTarget, setPlantTarget] = useState<number | null>(null) // lote vazio tocado com a seta
  const [levelUp, setLevelUp] = useState<number | null>(null)
  const [bonus, setBonus] = useState<FarmPayload['dailyBonus']>(null)
  // Mural: até onde o jogador já viu (no aparelho, por apelido). Na 1ª vez, o histórico antigo conta como visto.
  const [seenId, setSeenId] = useState<number | null>(null)
  // A tela de carregamento fica por cima até a cena desenhar o 1º quadro (antes, ~0,25 s de gramado vazio na visita).
  // 8 s de teto: se a cena não sobe (sem WebGL), o jogo aparece mesmo assim.
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!data || shown) return
    const t = setTimeout(() => setShown(true), 8000)
    return () => clearTimeout(t)
  }, [data, shown])
  const awayChecked = useRef(false)
  const [hover, setHover] = useState<{ idx: number; x: number; y: number } | null>(null)
  // O mouse andando dentro do mesmo lote só move o balão (DOM direto): o React redesenha só ao trocar de lote.
  const tipEl = useRef<HTMLDivElement>(null)
  const hoverIdx = useRef<number | null>(null)
  hoverIdx.current = hover?.idx ?? null
  // O balão some sozinho se o mouse parar (4 s) e ao sair da cena (SceneView): antes ficava preso no último lote.
  const hoverIdle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onHover = useCallback((idx: number | null, x: number, y: number) => {
    if (hoverIdle.current) clearTimeout(hoverIdle.current)
    if (idx != null) hoverIdle.current = setTimeout(() => { hoverIdx.current = null; setHover(null) }, 4000)
    if (idx != null && idx === hoverIdx.current && tipEl.current) {
      tipEl.current.style.left = `${x + 16}px`
      tipEl.current.style.top = `${y + 16}px`
      return
    }
    hoverIdx.current = idx
    setHover(idx == null ? null : { idx, x, y })
  }, [])
  // Bicho: balão ao passar o mouse (no celular, aparece por um instante ao tocar) e ficha aberta.
  const [animalHover, setAnimalHover] = useState<{ id: AnimalId; x: number; y: number } | null>(null)
  const [animalSlot, setAnimalSlot] = useState<AnimalId | null>(null)
  const [meatSlot, setMeatSlot] = useState<AnimalId | null>(null)
  const onAnimalHover = useCallback((id: AnimalId | null, x: number, y: number) => setAnimalHover(id ? { id, x, y } : null), [])
  const [fx, setFx] = useState<Fx[]>([])
  // Tooltip da barra de XP ou de popularidade: abre no toque (celular não tem hover) e fecha sozinho.
  const [hudTip, setHudTip] = useState<'xp' | 'pop' | null>(null)
  useEffect(() => {
    if (!hudTip) return
    const t = setTimeout(() => setHudTip(null), 4000)
    const off = (e: PointerEvent) => { if (!(e.target as Element | null)?.closest?.('[data-hud-tip]')) setHudTip(null) }
    window.addEventListener('pointerdown', off)
    return () => { clearTimeout(t); window.removeEventListener('pointerdown', off) }
  }, [hudTip])
  // wa: botão do WhatsApp no aviso (o convite sem menu nativo de compartilhar: link copiado).
  const [toast, setToast] = useState<{ text: string; bad?: boolean; icon?: string; wa?: string } | null>(null)
  // Modo edição da decoração (martelo): null = fora; itemId = enfeite ou caminho na mão.
  const [editing, setEditing] = useState<DecorEditState | null>(null)
  // Tela cheia: o botão só aparece onde o navegador deixa (no cliente, depois de montar).
  const [fullOk, setFullOk] = useState(false)
  const [full, setFull] = useState(false)
  useEffect(() => {
    setFullOk(canFullscreen(document))
    const sync = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  const [barnAt, setBarnAt] = useState<'decoracao' | undefined>()
  // Tutorial da 1ª sessão: avança pelas ações do jogador (ver Coach.tsx).
  const coach = useCoach(data?.me.handle, data?.me.level ?? 1)
  const coachRef = useRef(coach.advance)
  coachRef.current = coach.advance
  useEffect(() => { if (data) coachRef.current({ isOwn: data.isOwn }) }, [data?.isOwn, coach.index]) // eslint-disable-line react-hooks/exhaustive-deps
  // Notificações: pedido "suave" (cartão explicando) depois do 1º plantio, nunca na entrada.
  const [push, setPush] = useState<{ state: PushState; on: boolean; ask: boolean }>({ state: 'unsupported', on: false, ask: false })
  useEffect(() => {
    void registerSW()
    void isSubscribed().then((on) => setPush((p) => ({ ...p, state: pushState(), on })))
  }, [])
  const askPush = () => {
    const st = pushState()
    if ((st === 'default' || st === 'ios-install') && localStorage.getItem('cf:push-asked') !== '1') setPush((p) => ({ ...p, state: st, ask: true }))
  }
  const answerPush = async (yes: boolean) => {
    localStorage.setItem('cf:push-asked', '1')
    const st = yes && push.state === 'default' ? await enablePush() : pushState()
    setPush({ state: st, on: st === 'granted', ask: false })
    if (st === 'granted') setToast({ text: 'Pronto! Te aviso quando a horta ficar pronta e quando alguém mexer nela.' })
  }
  const togglePush = async () => {
    if (push.on) { await disablePush(); setPush((p) => ({ ...p, on: false })); return }
    const st = await enablePush()
    setPush((p) => ({ ...p, state: st, on: st === 'granted' }))
  }
  // Gancho de compartilhamento do momento (roubo sofrido, plantio demorado, nível novo).
  const [hook, setHook] = useState<{ title: string; text: string; place: SharePlace } | null>(null)
  const [busy, setBusy] = useState(false)
  const pointer = useRef({ x: 0, y: 0 })
  const lastLevel = useRef<number | null>(null)
  const fxId = useRef(0)
  const sceneApi = useRef<SceneApi | null>(null)
  const [fruits, setFruits] = useState<Fruit[]>([])
  // A frutinha chegou no Depósito: "pop" do x N.
  const dropFruit = useCallback((id: number) => { play('pop'); setFruits((cur) => cur.filter((f) => f.id !== id)) }, [])
  const isOwnRef = useRef(true)
  isOwnRef.current = data?.isOwn ?? !owner

  const load = useCallback(async () => {
    const res = await fetch(`/api/farm${owner ? `?owner=${encodeURIComponent(owner)}` : ''}`, { cache: 'no-store' })
    if (res.status === 401) return router.replace('/')
    const json = (await res.json()) as FarmPayload & { error?: string }
    if (!res.ok) return setToast({ text: json.error!, bad: true })
    setOffset(json.serverNow - Date.now())
    if (lastLevel.current != null && json.me.level > lastLevel.current) { setLevelUp(json.me.level); play('levelup') }
    lastLevel.current = json.me.level
    if (json.dailyBonus) { setBonus(json.dailyBonus); play('bonus') }
    setData(json)
  }, [owner, router])

  useEffect(() => { void load() }, [load])

  const seenKey = data ? `cf:mural:${data.me.handle}` : null
  const markSeen = useCallback(() => {
    if (!data || !seenKey) return
    const id = lastId(data.events)
    localStorage.setItem(seenKey, String(id))
    setSeenId(id)
  }, [data, seenKey])
  // Ao abrir a própria fazenda: se os amigos mexeram nela desde a última olhada, mostra o resumo (uma vez por entrada).
  useEffect(() => {
    if (!data || !seenKey || seenId != null) return
    const stored = localStorage.getItem(seenKey)
    if (stored == null) { localStorage.setItem(seenKey, String(lastId(data.events))); setSeenId(lastId(data.events)); return }
    const seen = Number(stored) || 0
    setSeenId(seen)
    if (!awayChecked.current && data.isOwn) {
      awayChecked.current = true
      if (awayWorthShowing(awaySummary(data.events, seen))) setPanel((p) => p ?? 'away')
    }
  }, [data, seenKey, seenId])

  // Áudio montado em tempo ocioso (suspenso): o 1º toque só precisa dar o resume() (unlock), sem tarefa longa.
  useEffect(() => {
    const ric = window.requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 1500))
    const cancel = window.cancelIdleCallback ?? window.clearTimeout
    const id = ric(() => prepareAudio(), { timeout: 4000 })
    return () => cancel(id)
  }, [])

  // Relógio local corrigido pelo relógio do servidor.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const serverNow = now + offset

  // Quando um lote amadurece (ou seca, ou aparece praga), busca o estado real no servidor.
  useEffect(() => {
    if (!data) return
    const next = Math.min(...data.plots.filter((p) => p.state === 'growing').map((p) => p.readyAt!))
    if (!Number.isFinite(next)) return
    const t = setTimeout(() => void load(), Math.max(0, next - (Date.now() + offset)) + 300)
    return () => clearTimeout(t)
  }, [data, offset, load])

  // Tempo real: alguém mexeu na minha fazenda.
  useEffect(() => {
    const es = new EventSource('/api/events')
    es.onmessage = (m) => {
      const ev = JSON.parse(m.data) as { kind: string; payload?: Record<string, unknown> }
      if (!ev.payload) return // "olá" da conexão
      const seed = SEED_BY_ID[String(ev.payload.seedId)]
      const msg: Record<string, { text: string; bad?: boolean }> = {
        stolen: { text: ev.payload.slot ? `Pegaram ${itemName(String(ev.payload.item))} dos seus bichos!` : `Roubaram ${ev.payload.qty} ${seed?.name ?? ''} da sua horta!`, bad: true },
        sabotaged: { text: ev.payload.kind === 'pest' ? 'Soltaram uma praga na sua horta!' : 'Plantaram erva daninha na sua horta!', bad: true },
        helped: { text: 'Um amigo ajudou na sua horta!' },
        bitten: { text: `${BITE_LINES.ownerTitle(String(ev.payload.actor ?? 'um ladrão'))} +${ev.payload.gold} de ouro` },
        visiting: { text: `${ev.payload.handle} está na sua fazenda agora!` },
        gift: { text: `Chegou presente: 1 semente de ${seed?.name ?? ''}!` },
        flower: { text: `Ganhou uma flor de ${seed?.name ?? ''}: +${ev.payload.charm ?? 1} de popularidade!` },
        friend_joined: { text: 'Um amigo entrou pelo seu convite!' },
        friend_added: { text: 'Você ganhou um amigo novo!' },
        share_xp: { text: `+${ev.payload.xp} XP pelo nível ${ev.payload.level} de ${String(ev.payload.actor ?? 'um amigo')}!` },
        share_seen: { text: `${String(ev.payload.actor ?? 'Um amigo')} abriu o seu link de nível e ganhou XP!` },
        loved: { text: 'Um amigo adubou sua horta com carinho 💚' },
        thanked: { text: `${String(ev.payload.actor ?? 'Um amigo')} agradeceu o seu presente 💐` },
        friend_ripe: { text: `A horta de ${ev.payload.handle} está madura. Corre lá! 🧺` },
        gold_bought: { text: `+${Number(ev.payload.gold).toLocaleString('pt-BR')} moedas de ouro na sua fazenda!` },
        gold_refunded: { text: 'Uma compra de ouro foi estornada.', bad: true },
        gold_adjusted: { text: 'O suporte ajustou o seu ouro.' },
      }
      if (ev.kind === 'stolen' && shareOnce('stolen')) {
        setHook({ title: 'Roubaram sua horta!', text: `Pegaram ${ev.payload.qty} ${seed?.name ?? ''} da minha horta 😤 me ajuda a me vingar no ${GAME_NAME}!`, place: 'roubado' })
      }
      if (ev.kind === 'bitten') {
        const thief = String(ev.payload.actor ?? 'um ladrão')
        setHook({ title: BITE_LINES.ownerTitle(thief), text: BITE_LINES.ownerShare(thief, GAME_NAME), place: 'mordida' })
        // Olhando a própria fazenda: o cachorro corre até o lote, como o ladrão viu.
        if (isOwnRef.current && typeof ev.payload.idx === 'number') sceneApi.current?.bite(ev.payload.idx, `+${ev.payload.gold} ouro`)
        else if (isOwnRef.current && typeof ev.payload.slot === 'string') sceneApi.current?.biteAnimal(ev.payload.slot as AnimalId, `+${ev.payload.gold} ouro`)
      }
      if (msg[ev.kind]) { setToast(msg[ev.kind]); play(ev.kind === 'bitten' ? 'coin' : ev.kind === 'gift' || ev.kind === 'flower' || ev.kind === 'loved' || ev.kind === 'thanked' ? 'gift' : 'notify'); void load() }
    }
    return () => es.close()
  }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), toast.wa ? 8000 : 3200)
    return () => clearTimeout(t)
  }, [toast])

  // Esc volta para a seta (como clicar na seta da barra).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPanel(null); setWant({}); setTool(ARROW); setBagOpen(false); setPlantTarget(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const showFx = useCallback((f: ActionFx | undefined, bad?: boolean, fruit = false) => {
    if (!f) return
    const { x, y } = pointer.current
    const add: Fx[] = []
    const push = (text: string, kind: Fx['kind']) => add.push({ id: ++fxId.current, x, y, text, kind })
    if (f.xp) push(`+${f.xp} XP`, 'xp')
    if (f.gold) push(`${f.gold > 0 ? '+' : '−'}${Math.abs(f.gold)} 🪙`, bad || f.gold < 0 ? 'bad' : 'gold')
    if (f.item && f.qty && f.qty > 0 && !fruit) push(`+${f.qty} ${itemName(f.item)}`, 'item')
    if (!add.length) return
    setFx((cur) => [...cur, ...add])
    setTimeout(() => setFx((cur) => cur.filter((c) => !add.includes(c))), 1400)
  }, [])

  const act = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true)
    try {
      const res = await fetch('/api/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const json = (await res.json()) as ActionJson
      const idx = typeof body.idx === 'number' ? body.idx : null
      const slot = typeof body.slot === 'string' ? (body.slot as AnimalId) : null
      // Respostas da horta com fala própria viram balão em cima do lote (lines.ts); o resto continua no toast.
      const line = res.ok ? json.say : json.code
      const api = sceneApi.current
      if (idx != null && api && isPlotLine(line)) api.sayAt(idx, PLOT_LINES[line])
      // Bicho: "Porco: não há nada para pegar aqui." e as outras falas viram balão de gibi em cima dele.
      else if (slot && api && !res.ok && json.code) api.sayAnimal(slot, isPlotLine(json.code) ? PLOT_LINES[json.code] : json.error!)
      // Faltou semente: pergunta se quer comprar, com atalho para a loja já nela.
      else if (!res.ok && json.code === 'no_seed') { setWant({ seedId: String(body.seedId) }); setPanel('noseed') }
      // Baú do tesouro ao limpar: o baú abre em cima do lote e o aviso traz o baú aberto.
      else if (res.ok && json.chest) { if (idx != null) api?.chestAt(idx); setToast({ text: json.message!, icon: CHEST_ICON }) }
      else setToast(res.ok ? { text: json.message!, bad: json.bad } : { text: json.error!, bad: true })
      // Colheu ou pegou do amigo: a frutinha sobe do pé até o Depósito, com o "x N".
      const kind = String(body.type)
      const fruit = res.ok && (idx != null || slot != null) && (kind === 'harvest' || kind === 'steal' || kind === 'collect_animal' || kind === 'steal_animal')
        && !!json.fx?.item && (json.fx.qty ?? 0) > 0
      if (fruit) {
        // O produto do bicho (ovo, leite, carne…) sobe do bicho com "x N".
        const from = (slot ? api?.animalPoint(slot) : api?.plotPoint(idx!)) ?? pointer.current
        const product = slot ? itemIcon(json.fx!.item!) : undefined
        setFruits((cur) => [...cur, { id: ++fxId.current, seedId: json.fx!.item!.replace(/^flor:/, ''), qty: json.fx!.qty!, from, product }])
      }
      if (res.ok) showFx(json.fx, json.bad, fruit)
      // Mordida: o cachorro corre até o lote (a cena late) e o ladrão pode contar a façanha.
      if (res.ok && json.bite) {
        if (json.bite.slot) api?.biteAnimal(json.bite.slot as AnimalId, `−${json.bite.gold} ouro`)
        else api?.bite(json.bite.idx, `−${json.bite.gold} ouro`)
        setHook({ title: BITE_LINES.thiefTitle(json.bite.owner), text: BITE_LINES.thiefShare(json.bite.owner, GAME_NAME), place: 'mordida' })
      }
      if (res.ok && body.type === 'plant') askPush()
      if (res.ok && body.type === 'plant') {
        const s = SEED_BY_ID[String(body.seedId)]
        if (s && json.readyAt && s.growMinutes >= 60 && shareOnce('plant')) {
          const at = new Date(json.readyAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          setHook({ title: 'Plantou! Chama a turma?', text: `Plantei ${s.name} no ${GAME_NAME}, fica pronto às ${at}… vem pegar antes de mim 😏`, place: 'gancho' })
        }
      }
      // Vibração curta de confirmação (Android; o iPhone ignora): erro vibra diferente.
      navigator.vibrate?.(!res.ok || json.bad ? [30, 40, 30] : 12)
      coachRef.current({ action: String(body.type), ok: res.ok && !json.bad, isOwn: !owner })
      play(!res.ok ? (isPlotLine(json.code) ? 'deny' : 'error') : json.bite ? 'bite' : json.bad ? 'bark'
        : kind === 'care' ? CARE_SFX[String(body.tool)] : kind === 'sabotage' && body.kind === 'weed' ? 'weed' : ACTION_SFX[kind] ?? 'click')
      await load()
      return res.ok ? json : null
    } finally {
      setBusy(false)
    }
  }, [load, showFx, owner])

  // Bicho solto num lugar novo (só na própria fazenda): salva sem toast; se o servidor recusar, avisa e recarrega
  // (o bicho volta para o lugar salvo).
  const moveAnimal = useCallback(async (animal: AnimalId, x: number, y: number) => {
    setData((d) => (d ? { ...d, animals: { ...d.animals, [animal]: { x, y } } } : d))
    const res = await fetch('/api/action', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'move_animal', animal, x: Math.round(x), y: Math.round(y) }),
    }).catch(() => null)
    if (res?.ok) return
    const json = (await res?.json().catch(() => null)) as { error?: string } | null
    setToast({ text: json?.error ?? 'Não deu para salvar o lugar do bicho', bad: true })
    play('error')
    await load()
  }, [load])

  // Modo edição: cada gesto na cena vira uma ação no servidor. A cena já mostra o resultado (otimista);
  // se o servidor recusar, avisa com o motivo e recarrega (o enfeite volta para onde estava).
  const decorAct = useCallback(async (body: Record<string, unknown>, optimistic?: (placed: Placed[]) => Placed[]) => {
    if (optimistic) setData((d) => (d ? { ...d, decor: { ...d.decor, placed: optimistic(d.decor.placed) } } : d))
    const res = await fetch('/api/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const json = (await res?.json().catch(() => null)) as { error?: string; message?: string } | null
    if (res?.ok) {
      play('click')
      setEditing((e) => (e?.bad ? { ...e, hint: undefined, bad: false } : e))
    } else {
      setEditing((e) => (e ? { ...e, hint: json?.error ?? 'Não deu para salvar', bad: true } : e))
      play('error')
    }
    await load()
    return !!res?.ok
  }, [load])

  const onDecor = useCallback((ev: DecorEvent) => {
    const tmp = -Date.now()
    switch (ev.kind) {
      case 'select': return setEditing((e) => (e ? { ...e, selected: ev.id, hint: undefined, bad: false } : e))
      case 'hint': return setEditing((e) => (e ? { ...e, hint: ev.text, bad: ev.bad } : e))
      case 'place':
        void decorAct({ type: 'decor_place', itemId: ev.itemId, u: ev.u, v: ev.v }, (p) => [...p, { id: tmp, itemId: ev.itemId, u: ev.u, v: ev.v }])
          .then((ok) => { if (ok) setEditing((e) => (e ? { ...e, hint: undefined, bad: false } : e)) })
        return
      case 'move':
        void decorAct({ type: 'decor_move', id: ev.id, u: ev.u, v: ev.v }, (p) => p.map((x) => (x.id === ev.id ? { ...x, u: ev.u, v: ev.v } : x)))
        return
      case 'paint':
        void decorAct({ type: 'decor_paint', itemId: ev.itemId, cells: ev.cells },
          (p) => [...p, ...ev.cells.map(([u, v], i) => ({ id: tmp - i, itemId: ev.itemId, u, v }))])
        return
      case 'erase': {
        const want = new Set(ev.cells.map(([u, v]) => `${u},${v}`))
        void decorAct({ type: 'decor_erase', cells: ev.cells }, (p) => p.filter((x) => !(x.itemId.startsWith('caminho_') && want.has(`${x.u},${x.v}`))))
      }
    }
  }, [decorAct])

  // Acabou o estoque do item na mão: volta para "Mover".
  useEffect(() => {
    if (!editing?.itemId || !data) return
    const left = (data.myDecor.owned[editing.itemId] ?? 0) - (data.myDecor.used[editing.itemId] ?? 0)
    if (left <= 0) setEditing((e) => (e ? { mode: 'move', hint: e.hint, bad: e.bad } : e))
  }, [data, editing?.itemId])

  // Edição só na própria fazenda.
  useEffect(() => { if (data && !data.isOwn) setEditing(null) }, [data?.isOwn]) // eslint-disable-line react-hooks/exhaustive-deps

  const plots: PlotView[] = useMemo(() => {
    if (!data) return []
    return data.plots.map((p) => (p.state !== 'growing' ? p : { ...p, stage: stageAt(p.plantedAt!, p.readyAt!, serverNow, stageFracs(SEED_BY_ID[p.seedId ?? ''])) }))
  }, [data, serverNow])

  const qtyOf = useCallback((itemId: string) => data?.inventory.find((i) => i.itemId === itemId)?.qty ?? 0, [data])

  const scenePlots: ScenePlot[] = useMemo(() => {
    if (!data) return []
    const list: ScenePlot[] = plots.map((p) => ({
      idx: p.idx, state: p.state, seedId: p.seedId, stage: p.stage, canSteal: p.canSteal, pests: p.pests, weeds: p.weeds, dry: p.dry,
      progress: p.state === 'growing' ? Math.min(1, (serverNow - p.plantedAt!) / (p.readyAt! - p.plantedAt!)) : undefined,
    }))
    // Na própria fazenda, o próximo terreno aparece "à venda".
    if (data.isOwn && data.land.next) list.push({ idx: plots.length, state: 'locked' })
    return list
  }, [data, plots, serverNow])

  // Toque no bicho (seta, mão ou ração): colher, pegar do amigo, alimentar ou abrir a ficha. false = só cutucar.
  const onAnimalTap = useCallback((id: AnimalId): boolean => {
    if (!data) return false
    const a = data.livestock.find((x) => x.slot === id)
    if (!a) return false
    if (busy) return true
    const peek = () => {
      const p = sceneApi.current?.animalPoint(id) ?? pointer.current
      setAnimalHover({ id, ...p })
      setTimeout(() => setAnimalHover((h) => (h?.id === id ? null : h)), 2500)
    }
    if (tool.id === 'feed') {
      if (!data.isOwn) { setToast({ text: 'Só o dono alimenta os bichos', bad: true }); return true }
      void act({ type: 'feed_animal', slot: id, itemId: tool.itemId })
      return true
    }
    if (data.isOwn) {
      if ((tool.id === 'hand' || tool.id === 'arrow') && a.ready) {
        // Bicho de corte sai da fazenda quando colhido: pergunta antes ("Colher o burro? Ele vai sair da fazenda.").
        if (a.meat) setMeatSlot(id)
        else void act({ type: 'collect_animal', slot: id })
        return true
      }
      if (tool.id === 'arrow') { setAnimalSlot(id); setPanel('animal'); return true }
      peek()
      return false
    }
    // Na fazenda do amigo: a mão sempre tenta (o bicho sem nada responde no balão); a seta só se tiver pronto.
    if (tool.id === 'hand' || (tool.id === 'arrow' && a.ready)) { void act({ type: 'steal_animal', owner: data.owner.handle, slot: id }); return true }
    peek()
    return false
  }, [data, busy, tool, act])

  const looks: SceneLooks | undefined = useMemo(() => data
    ? { looks: Object.fromEntries((data.livestock ?? []).map((a) => [a.slot, a.look])), wear: data.wear ?? {}, ready: (data.livestock ?? []).filter((a) => a.ready).map((a) => a.slot) }
    : undefined, [data])

  const onTap = useCallback((idx: number) => {
    if (!data || busy || editing) return
    if (data.isOwn && idx >= data.plots.length) return setPanel('expand')
    const p = plots.find((x) => x.idx === idx)
    if (!p) return
    const owner = data.isOwn ? undefined : data.owner.handle
    const careFor = (t: 'water' | 'pesticide' | 'herbicide') => act({ type: 'care', idx, tool: t, owner })
    // Toque sem efeito: mostra o balão do lote por um instante (no celular não há hover).
    const peek = () => {
      startTransition(() => setHover({ idx, ...pointer.current }))
      setTimeout(() => setHover((h) => (h?.idx === idx ? null : h)), 2500)
    }

    switch (tool.id) {
      case 'arrow': {
        // A seta faz a ação óbvia de cada lote.
        // Na horta do amigo, tocar de novo num lote sem nada para você também vai ao servidor: a resposta é o "ganancioso".
        if (p.state === 'ripe') return void (data.isOwn ? act({ type: 'harvest', idx }) : act({ type: 'steal', owner, idx }))
        if (p.state === 'withered') return void (data.isOwn ? act({ type: 'clear', idx }) : peek())
        if (p.state === 'empty') {
          if (!data.isOwn) return peek()
          // Transição: a página inteira redesenha com a sacola aberta em pedaços, sem travar o quadro do toque
          // (era a tarefa longa do toque no celular com CPU 4×; Evolução 12).
          startTransition(() => {
            setPlantTarget(idx)
            setBagOpen(true)
          })
          return
        }
        if (p.dry) return void careFor('water')
        if (p.pests) return void careFor('pesticide')
        if (p.weeds) return void careFor('herbicide')
        return peek()
      }
      case 'hoe': return void (p.state === 'withered' ? act({ type: 'clear', idx }) : setToast({ text: 'A enxada é para planta seca', bad: true }))
      case 'water': return void careFor('water')
      case 'pesticide': return void careFor('pesticide')
      case 'herbicide': return void careFor('herbicide')
      case 'pest': return void act({ type: 'sabotage', idx, kind: 'pest', owner })
      case 'weed': return void act({ type: 'sabotage', idx, kind: 'weed', owner })
      case 'hand': {
        if (p.state !== 'ripe') return peek()
        return void (data.isOwn ? act({ type: 'harvest', idx }) : act({ type: 'steal', owner, idx }))
      }
      case 'fertilizer':
      case 'love': {
        // 1 adubo por estágio e 1 amor por dia (o servidor confere de novo): avisa sem gastar a viagem.
        if (tool.id === 'love' && data.me.loveLeft <= 0) return setToast({ text: 'Você já usou o Fertilizante do Amor hoje. Amanhã tem mais!', bad: true })
        if (p.state !== 'growing') return setToast({ text: 'Adubo só em planta crescendo', bad: true })
        // A recusa é um balão em cima do lote, não um aviso.
        if (p.fertilized) { play('deny'); return sceneApi.current?.sayAt(idx, PLOT_LINES.fertTwice) }
        return void (tool.id === 'love' ? act({ type: 'love', idx, owner }) : act({ type: 'fertilize', idx, itemId: tool.itemId ?? 'adubo' }))
      }
      case 'seed': {
        if (p.state !== 'empty') return peek()
        const seedId = tool.seedId!
        if (qtyOf(seedItem(seedId)) <= 0) { setWant({ seedId }); setPanel('noseed'); return }
        void act({ type: 'plant', idx, seedId }).then(() => {
          // Acabou a semente: volta para a seta.
          if (qtyOf(seedItem(seedId)) <= 1) setTool(ARROW)
        })
      }
    }
  }, [data, plots, tool, busy, act, qtyOf, editing])

  // Som: preferências por jogador (música e efeitos separados, com volume); a música muda entre dia, noite e visita.
  const [sound, setSound] = useState<Prefs>(() => prefs())
  const handle = data?.me.handle
  useEffect(() => { setSoundUser(handle); setSound(prefs()) }, [handle])
  const visiting = data ? !data.isOwn : !!owner
  useEffect(() => {
    const pick = () => setMusicMode(visiting ? 'visit' : isNightBrasilia() ? 'night' : 'day')
    pick()
    const t = setInterval(pick, 60_000)
    return () => clearInterval(t)
  }, [visiting])
  const changeSound = (p: Partial<Prefs>) => setSound(setPrefs(p))
  const soundOn = sound.sfx || sound.music
  const toggleSound = () => changeSound(soundOn ? { sfx: false, music: false } : { sfx: true, music: true })

  const logout = useCallback(async () => { await fetch('/api/logout', { method: 'POST' }); router.replace('/') }, [router])

  const pickTool = useCallback((id: ToolId) => {
    play('click')
    setPlantTarget(null)
    if (id === 'bag') return setBagOpen((o) => !o)
    setBagOpen(false)
    setTool({ id })
  }, [])

  const pickBagItem = useCallback((itemId: string) => {
    if (itemId === 'racao') { void act({ type: 'feed_dog' }); return }
    const t = bagItemTool(itemId)
    if (!t) return
    setTool(t)
    setBagOpen(false)
    if (t.id === 'seed' && plantTarget != null) void act({ type: 'plant', idx: plantTarget, seedId: t.seedId })
    setPlantTarget(null)
  }, [act, plantTarget])

  const bagShop = useCallback(() => { setBagOpen(false); setPanel('shop') }, [])
  const bagClose = useCallback(() => { setBagOpen(false); setPlantTarget(null) }, [])

  if (!data) return owner ? <main className="game"><VisitLoading owner={owner} /></main> : <div className="loading" role="status"><span className="loading-text">Carregando informações da fazenda…</span></div>

  const { me } = data
  const level = levelForXp(me.xp)
  const base = xpToReach(level), next = xpToReach(level + 1)
  const xpPct = Math.round(((me.xp - base) / (next - base)) * 100)
  const popLevel = popLevelFor(me.popularity)
  const tipLines = hudTip === 'xp' ? HUD_TIPS.xp(me.xp, next - me.xp)
    : hudTip === 'pop' ? HUD_TIPS.pop(me.popularity, popToReach(popLevel + 1) - me.popularity) : null
  const tip = tipLines && (
    <div className={`hud-tip ${hudTip}`} role="tooltip" data-hud-tip onClick={() => setHudTip(null)}>
      <div>{tipLines[0]}</div><div>{tipLines[1]}</div>
      {hudTip === 'pop' && <small>Bônus na venda: +{Math.min(POPULARITY_CAP, me.popularity)}% (até +{POPULARITY_CAP}%)</small>}
    </div>
  )
  const barnCount = data.inventory.filter((i) => sellPriceOf(i.itemId) > 0).reduce((s, i) => s + i.qty, 0)
  const claimable = data.missions.filter((m) => !m.claimed && m.progress >= m.target).length
  const unthanked = data.gifts.filter((g) => !g.thanked && g.from).length
  const muralNew = seenId == null ? 0 : unseenCount(data.events, seenId)
  // Convidou por qualquer caminho (Mais, HUD): o último passo do tutorial ("chame um amigo") está cumprido.
  const invite = () => {
    if (coach.step?.id === 'invite') coach.finish()
    shareNow('convite')(`Bora jogar ${GAME_NAME} comigo? Planta, colhe e (com jeitinho) pega da minha horta 😄`)
  }
  const hovered = hover ? plots.find((p) => p.idx === hover.idx) : undefined
  const modal = !!panel || !!meatSlot || !!bonus || !!levelUp
  const counts: Partial<Record<ToolId, number>> = data.isOwn ? {} : { pest: me.pestsLeft, weed: me.weedsLeft, love: me.loveLeft }
  // Sem o menu nativo (ou se ele falhar), o link já foi copiado: o aviso confirma e oferece o WhatsApp.
  // `place`: onde a pessoa tocou (métricas do jogo, server/metrics.ts).
  const sendShare = (place: SharePlace, text: string, link: string) => {
    noteShare(place)
    void share(text, link).then((r) => {
      if (r === 'copied' || r === 'failed') setToast({ text: r === 'copied' ? 'Link copiado!' : 'Manda pelo WhatsApp:', wa: whatsappLink(text, link) })
    })
  }
  const shareNow = (place: SharePlace) => (text: string) => sendShare(place, nostalgic(text), inviteLink(me.inviteCode))
  const toastEl = toast && (
    <div className={`toast ${toast.bad ? 'bad' : ''}`} role="status">
      {toast.icon && <img className="toast-icon" src={toast.icon} alt="" onError={toastIconFallback} />}{toast.text}
      {toast.wa && <a className="btn small toast-wa" href={toast.wa} target="_blank" rel="noopener noreferrer" onClick={() => setToast(null)}>WhatsApp</a>}
    </div>
  )
  const close = () => { setPanel(null); setWant({}) }
  // Evento sazonal (Evolução 09): selo da HUD conta missões para receber e o prêmio da tigela.
  const ev = data.event
  const evBadge = ev ? ev.missions.filter((m) => m.open && !m.claimed && m.progress >= m.target).length + (ev.bowl?.prizeReady ? 1 : 0) : 0
  // Evolução 13: objetos das mecânicas na cena (árvore, boneco/baú/ovo, Coelho Mágico) e os bichos do evento passeando.
  const sceneProps: SceneProp[] = []
  if (ev?.build) { const src = buildSrc(ev.dir, ev.id, ev.build.level); if (src) sceneProps.push({ id: 'build', src }) }
  if (ev?.help && !ev.help.locked) { const src = helpSrc(ev.dir, ev.help.id, ev.help.helps, ev.help.friends, ev.help.claimed); if (src) sceneProps.push({ id: 'help', src }) }
  if (ev?.workshop) sceneProps.push({ id: 'npc', src: `${ev.dir}/coelho_magico_sheet.png`, sheet: true })
  const scenePets = data.pets.map((p) => ({ id: p.id, src: `${p.dir}/${p.id}_sheet.png`, line: p.line }))
  const sceneEvent: SceneEvent = ev
    ? { dir: ev.dir, bowl: ev.bowl?.look ?? null, bowlArt: ev.bowlArt, critters: ev.critters ? { left: ev.critters.left, kinds: ev.critters.kinds } : null, props: sceneProps, pets: scenePets }
    : scenePets.length ? { dir: '', bowl: null, critters: null, props: [], pets: scenePets } : null
  const onPropTap = (id: SceneProp['id']) => { setEventTab(id === 'build' ? 'arvore' : id === 'help' ? 'ajuda' : 'oficina'); setPanel('event') }
  // Tigela na cena: o visitante pega direto (clicando na tigela); o dono pega o prêmio ou abre a janela.
  const onBowlTap = () => {
    if (!ev?.bowl || busy) return
    if (!data.isOwn && ev.bowl.canTake) void act({ type: 'event_take', owner: data.owner.handle })
    else if (data.isOwn && ev.bowl.prizeReady) void act({ type: 'event_prize' })
    else setPanel('event')
  }
  const onCritterTap = (n: number) => {
    if (!ev?.critters || busy) return
    if (!data.isOwn) { setToast({ text: 'Só o dono da fazenda espanta os visitantes' }); return }
    void act({ type: 'event_shoo', n }).then((ok) => { if (ok) sceneApi.current?.shooCritter(n) })
  }

  return (
    <main className="game" onPointerDownCapture={unlock}>
      <header className="hud">
        <div className="avatar"><Avatar id={me.avatar} handle={me.handle} /></div>
        <div className="who">
          <strong title={me.handle}>{me.handle}</strong>
          <button type="button" className="xp" data-hud-tip aria-expanded={hudTip === 'xp'} aria-label={`Experiência: nível ${level}`}
            onClick={() => { play('click'); setHudTip((t) => (t === 'xp' ? null : 'xp')) }}>
            <span className="lvl">Nv {level}</span>
            <span className="bar"><i style={{ width: `${xpPct}%` }} /></span>
          </button>
          {hudTip === 'xp' && tip}
        </div>
        <div className="money">
          <div className="gold-row">
            {data.isOwn && <button className="gold-add" onClick={() => setPanel('gold')} title="Comprar moedas" aria-label="Comprar moedas">+</button>}
            <span className="gold" data-testid="gold" title="Ouro"><Icon name="coin" emoji="🪙" size={20} /> {fmtGold(me.gold)}</span>
          </div>
          <span className="credits" title="Créditos (compra futura via Pix)"><Icon name="credit" emoji="💎" size={20} /> {me.credits}</span>
          <button type="button" className="pop" data-hud-tip aria-expanded={hudTip === 'pop'} aria-label={`Popularidade: nível ${popLevel}`}
            onClick={() => { play('click'); setHudTip((t) => (t === 'pop' ? null : 'pop')) }}>♥ {me.popularity} <small className="pop-lvl">Nv {popLevel}</small></button>
          {hudTip === 'pop' && tip}
        </div>
        <nav className="hud-buttons">
          {ev && (
            <button className="hud-btn event-btn" onClick={() => setPanel('event')} title={`${ev.name}: tigela, trocas e missões`}>
              <Icon name={ev.icon} emoji="🎃" size={34} /><span>{ev.name}</span>{evBadge ? <em>{evBadge}</em> : null}
            </button>
          )}
          <button className="hud-btn" onClick={() => setPanel('sound')} title="Som: música e efeitos">
            <Icon name={soundOn ? 'sound' : 'sound_off'} emoji={soundOn ? '🔊' : '🔇'} size={34} /><span>Som</span>
          </button>
          <button className="hud-btn" onClick={() => { setWant({}); setPanel('shop') }} title="Loja"><Icon name="shop" emoji="🏪" size={34} /><span>Loja</span></button>
          <button data-barn className={`hud-btn ${coach.step?.target === 'barn' ? 'coach-pulse' : ''}`} onClick={() => setPanel('barn')} title="Depósito">
            <Icon name="barn" emoji="🧺" size={34} /><span>Depósito</span>{barnCount ? <em>{barnCount}</em> : null}
          </button>
          <button className="hud-btn" onClick={() => setPanel('missions')} title="Missões do dia">
            <Icon name="mission" emoji="📋" size={34} /><span>Missões</span>{claimable ? <em>{claimable}</em> : null}
          </button>
          <button className={`hud-btn ${coach.step?.target === 'friends' ? 'coach-pulse' : ''}`} onClick={() => setPanel('friends')} title="Amigos">
            <Icon name="friends" emoji="👥" size={34} /><span>Amigos</span>
            {data.neighbors.filter((n) => n.friend && n.ripe > 0).length ? <em>✋</em> : null}
          </button>
          <button className="hud-btn" onClick={() => { setWant({}); setPanel('gifts') }} title="Presentes">
            <Icon name="gift_daily" emoji="🎁" size={34} /><span>Presentes</span>{unthanked ? <em>{unthanked}</em> : null}
          </button>
          <button className="hud-btn" onClick={() => setPanel('feed')} title="Mural"><Icon name="board" emoji="📜" size={34} /><span>Mural</span>{muralNew ? <em>{muralNew}</em> : null}</button>
          <button className="hud-btn" onClick={invite} title={`Convidar amigos: +${INVITE.gold} de ouro para os dois`}>
            <Icon name="invite" emoji="💌" size={34} /><span>Convidar</span>
          </button>
          <button className="hud-btn" onClick={() => setPanel('help')} title="Dúvidas: como jogar">
            <Icon name="help_book" emoji="❓" size={34} /><span>Dúvidas</span>
          </button>
          {COMMUNITY_URL && (
            <a className="hud-btn" href={COMMUNITY_URL} target="_blank" rel="noopener noreferrer" title="Comunidade dos jogadores">
              <Icon name="community" emoji="💬" size={34} /><span>Comunidade</span>
            </a>
          )}
        </nav>
      </header>

      {data.isOwn && <Assistant items={assistant(plots, data.livestock, me.dog)} onPick={(i) => {
        play('click')
        if (i.tool === 'dog') return setPanel('dog')
        if (i.tool === 'feed') {
          const a = data.livestock.find((x) => x.hungry)
          if (a) { setAnimalSlot(a.slot as AnimalId); setPanel('animal') }
          return
        }
        setBagOpen(false)
        setTool({ id: i.tool })
      }} />}

      {!data.isOwn && (
        <div className="visit">
          <span>Fazenda de <b>{data.owner.handle}</b> · Nv {data.owner.level}{data.owner.isBot ? ' · vizinha' : ''}</span>
          <span className="steals">✋ {me.stealsLeft} {me.stealMode === 'tap' ? 'para pegar' : 'roubos'} · 🐛 {me.pestsLeft} · 🌿 {me.weedsLeft} hoje</span>
          {/* Risco legível antes de roubar: o cachorro está acordado? com que chance morde? */}
          <button className={`dog-risk ${data.owner.dog?.awake ? 'awake' : ''}`} onClick={() => setPanel('dog')}>
            {!data.owner.dog ? '🐾 Sem cachorro'
              : data.owner.dog.awake ? `🐕 ${data.owner.dog.name} acordado · morde ${Math.round(data.owner.dog.bite * 100)}%`
              : `💤 ${data.owner.dog.name} dormindo`}
          </button>
          <Link href="/fazenda" className="btn small">Voltar</Link>
          {/* Na visita o aviso fica preso logo abaixo desta barra (placar de roubos e Voltar sempre à vista). */}
          {toastEl}
        </div>
      )}

      <SceneView
        apiRef={sceneApi}
        plots={scenePlots}
        visiting={!data.isOwn}
        farm={data.owner.id}
        dog={data.owner.dog ? { awake: data.owner.dog.awake, breed: data.owner.dog.kind, patrol: data.owner.dog.patrol, clock: offset } : null}
        animals={data.animals}
        herd={data.herd}
        looks={looks}
        onAnimalTap={onAnimalTap}
        onAnimalHover={onAnimalHover}
        onAnimalMove={data.isOwn ? moveAnimal : undefined}
        decor={data.decor}
        edit={editing && data.isOwn ? { mode: editing.mode, itemId: editing.itemId, selected: editing.selected } : null}
        onDecor={onDecor}
        cursor={toolCursor(tool, !data.isOwn)}
        pressedCursor={toolCursor(tool, !data.isOwn, true)}
        onTap={onTap}
        onHover={onHover}
        onDogTap={() => setPanel('dog')}
        event={sceneEvent}
        onBowlTap={onBowlTap}
        onCritterTap={onCritterTap}
        onPropTap={onPropTap}
        onShown={() => setShown(true)}
        onPointer={(x, y) => { pointer.current = { x, y } }}
      />

      {bagOpen && data.isOwn && (
        <BagStrip inventory={data.inventory} level={level} active={tool} onUse={pickBagItem} onShop={bagShop} onClose={bagClose} />
      )}

      <div className="bottom">
        {/* Zoom no canto inferior direito (lupa); a pinça e a roda continuam. */}
        <div className="zoom-ctl" role="group" aria-label="Zoom">
          <button className="zoom-btn" onClick={() => sceneApi.current?.zoom(1)} aria-label="Aproximar" title="Aproximar">+</button>
          <button className="zoom-btn" onClick={() => sceneApi.current?.zoom(-1)} aria-label="Afastar" title="Afastar">−</button>
          {fullOk && (
            <button className={`zoom-btn full ${full ? 'on' : ''}`} aria-pressed={full} aria-label={full ? 'Sair da tela cheia' : 'Tela cheia'} title={full ? 'Sair da tela cheia' : 'Tela cheia'}
              onClick={() => { play('click'); void toggleFullscreen(document).then(setFull) }}>
              {/* Quatro cantos para fora (entrar) ou para dentro (sair). */}
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={full ? 'M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6' : 'M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6'} />
              </svg>
            </button>
          )}
          {/* Martelo: arrumar a decoração (só na própria fazenda). */}
          {data.isOwn && (
            <button className={`zoom-btn hammer ${editing ? 'on' : ''}`} aria-pressed={!!editing} title="Arrumar a fazenda (decoração)" aria-label="Arrumar a fazenda"
              onClick={() => { play('click'); setTool(ARROW); setBagOpen(false); setPlantTarget(null); setEditing((e) => (e ? null : { mode: 'move' })) }}>🔨</button>
          )}
        </div>
        {editing && data.isOwn ? (
          <DecorEditBar decor={data.myDecor} state={editing} busy={busy}
            onState={(s) => setEditing(s)}
            onStore={(id) => { void decorAct({ type: 'decor_store', id }, (p) => p.filter((x) => x.id !== id)); setEditing((e) => (e ? { ...e, selected: null } : e)) }}
            onShop={() => { setWant({ shopTab: 'decoracao' }); setPanel('shop') }}
            onClose={() => setEditing(null)} />
        ) : (
          <Toolbar visiting={!data.isOwn} active={tool} bagOpen={bagOpen} onPick={pickTool} counts={counts} />
        )}
        <NeighborBar neighbors={data.neighbors} isOwn={data.isOwn} current={data.owner.handle} onLogout={logout} />
        {/* Celular: barra de abas no alcance do polegar (no computador ficam os botões da HUD). */}
        <nav className="tabbar" aria-label="Menu">
          <button onClick={() => { setWant({}); setPanel('shop') }}><Icon name="shop" emoji="🏪" size={30} /><span>Loja</span></button>
          <button data-barn className={coach.step?.target === 'barn' ? 'coach-pulse' : ''} onClick={() => setPanel('barn')}>
            <Icon name="barn" emoji="🧺" size={30} /><span>Depósito</span>{barnCount ? <em>{barnCount}</em> : null}
          </button>
          {data.isOwn ? (
            <button className={coach.step?.target === 'friends' ? 'coach-pulse' : ''} onClick={() => setPanel('friends')}>
              <Icon name="friends" emoji="👥" size={30} /><span>Amigos</span>
              {data.neighbors.some((n) => n.friend && n.ripe > 0) ? <em>✋</em> : null}
            </button>
          ) : (
            <Link href="/fazenda" className="home"><span className="tab-emoji">🏠</span><span>Minha</span></Link>
          )}
          <button onClick={() => setPanel('missions')}>
            <Icon name="mission" emoji="📋" size={30} /><span>Missões</span>{claimable ? <em>{claimable}</em> : null}
          </button>
          <button onClick={() => setPanel('more')}><span className="tab-emoji">☰</span><span>Mais</span>{unthanked + muralNew ? <em>{unthanked + muralNew}</em> : null}</button>
        </nav>
      </div>

      {/* Balões só sem janela aberta: o Pixi segue o mouse por baixo da janela e o balão cobria os botões dela. */}
      {animalHover && !modal && !editing && (() => {
        const a = data.livestock.find((x) => x.slot === animalHover.id)
        return a ? <AnimalTip a={a} x={animalHover.x} y={animalHover.y} now={serverNow} at={data.serverNow} visiting={!data.isOwn} /> : null
      })()}
      {hovered && hover && !modal && !editing && <PlotTip tipRef={tipEl} plot={hovered} x={hover.x} y={hover.y} now={serverNow} visiting={!data.isOwn} />}
      <FxLayer fx={fx} />
      <FruitLayer fruits={fruits} onDone={dropFruit} />
      {data.isOwn && toastEl}

      {panel === 'gold' && <GoldShopDialog orderId={payOrder ?? undefined} onGold={load} onClose={() => { setPayOrder(null); close() }} />}
      {panel === 'shop' && <ShopDialog me={{ ...me, level }} decor={data.myDecor} event={ev} now={serverNow} busy={busy} act={act} at={want.shopAt} tab={want.shopTab} onClose={close} />}
      {panel === 'event' && ev && <EventDialog ev={ev} isOwn={data.isOwn} owner={data.owner.handle} now={serverNow} busy={busy} act={act} at={eventTab}
        friends={data.neighbors.filter((n) => n.friend && !n.isBot).map((n) => n.handle)} onShare={shareNow('evento')} onClose={() => { setEventTab(undefined); close() }} />}
      {panel === 'noseed' && want.seedId && (
        <NoSeedDialog seedId={want.seedId} onClose={close}
          onShop={() => { setWant({ shopAt: seedItem(want.seedId!) }); setPanel('shop') }} />
      )}
      {panel === 'gifts' && (
        <GiftsDialog me={{ ...me, level }} neighbors={data.neighbors} gifts={data.gifts} now={serverNow} busy={busy} act={act} to={want.giftTo} onClose={close} />
      )}
      {panel === 'barn' && (
        <BarnDialog me={me} inventory={data.inventory} decor={data.myDecor} isOwn={data.isOwn} busy={busy} act={act} at={barnAt}
          onDecorEdit={(itemId) => { close(); setBarnAt(undefined); setTool(ARROW); setBagOpen(false); setEditing(itemId ? { mode: 'place', itemId } : { mode: 'move' }) }}
          onClose={() => { close(); setBarnAt(undefined) }} />
      )}
      {panel === 'missions' && <MissionsDialog missions={data.missions} busy={busy} act={act} onShare={shareNow('missao')} onClose={close} />}
      {panel === 'expand' && <ExpandDialog me={{ ...me, level }} land={data.land} busy={busy} act={act} onClose={close} />}
      {panel === 'animal' && animalSlot && (() => {
        const a = data.livestock.find((x) => x.slot === animalSlot)
        return a ? (
          <AnimalDialog a={a} isOwn={data.isOwn} owner={data.owner.handle} wear={data.wear?.[a.slot] ?? []} inventory={data.inventory}
            busy={busy} act={act} onShop={() => setPanel('shop')} onClose={close} />
        ) : null
      })()}
      {panel === 'dog' && (
        <DogDialog me={me} owner={data.owner} isOwn={data.isOwn} food={qtyOf('racao')} bones={qtyOf('osso')} now={serverNow} busy={busy} act={act}
          wear={data.wear?.dog ?? []} inventory={data.inventory}
          onShop={() => setPanel('shop')} onClose={close} />
      )}
      {panel === 'more' && (
        <Dialog title="Mais" icon={<span className="hud-emoji" aria-hidden>⚙️</span>} onClose={close}>
          <h3 className="menu-head t-label">Fazenda</h3>
          <div className="menu-list">
            {ev && <button className="btn" onClick={() => setPanel('event')}><Icon name={ev.icon} emoji="🎃" size={26} /> {ev.name}{evBadge ? <em>{evBadge}</em> : null}</button>}
            <button className="btn" onClick={() => { setWant({}); setPanel('gifts') }}>
              <Icon name="gift_daily" emoji="🎁" size={26} /> Presentes{unthanked ? <em>{unthanked}</em> : null}
            </button>
            <button className="btn" onClick={() => setPanel('feed')}><Icon name="board" emoji="📜" size={26} /> Mural{muralNew ? <em>{muralNew}</em> : null}</button>
            <button className="btn" onClick={invite}><Icon name="invite" emoji="💌" size={26} /> Convidar amigos</button>
            <button className="btn" onClick={() => setPanel('help')}><Icon name="help_book" emoji="❓" size={26} /> Dúvidas</button>
            {COMMUNITY_URL && <a className="btn" href={COMMUNITY_URL} target="_blank" rel="noopener noreferrer"><Icon name="community" emoji="💬" size={26} /> Comunidade</a>}
            {data.isOwn ? null : <button className="btn" onClick={() => setPanel('friends')}><Icon name="friends" emoji="👥" size={26} /> Amigos</button>}
          </div>
          <h3 className="menu-head t-label">Configurações</h3>
          <div className="menu-list">
            {push.state === 'ios-install' ? (
              <p className="muted small">🔔 Para receber avisos no iPhone: toque em Compartilhar ⬆️ e depois em “Adicionar à Tela de Início”.</p>
            ) : push.state !== 'unsupported' && (
              <button className="btn" role="switch" aria-checked={push.on} onClick={togglePush} disabled={push.state === 'denied'}>
                <span className="tab-emoji">🔔</span> Avisos
                {push.state === 'denied' ? <small className="menu-note">bloqueados no navegador</small> : <span className={`switch ${push.on ? 'on' : ''}`} aria-hidden />}
              </button>
            )}
            <SoundControls prefs={sound} onChange={changeSound} />
            <a className="btn" href="/conta"><span className="tab-emoji">👤</span> Minha conta</a>
            <button className="btn" onClick={logout}><span className="tab-emoji">↩</span> Sair</button>
          </div>
          <p className="muted small center">Dica: arraste para andar pela fazenda, faça pinça (ou use + e −) para zoom e segure o dedo num lote para ver os detalhes.</p>
        </Dialog>
      )}
      {panel === 'sound' && (
        <Dialog title="Som" icon={<Icon name={soundOn ? 'sound' : 'sound_off'} emoji={soundOn ? '🔊' : '🔇'} size={26} />} onClose={close}>
          <SoundControls prefs={sound} onChange={changeSound} />
          <div className="menu-list" style={{ marginTop: 10 }}>
            <button className="btn" onClick={toggleSound}><span className="tab-emoji">{soundOn ? '🔇' : '🔊'}</span> {soundOn ? 'Silenciar tudo' : 'Ligar tudo'}</button>
          </div>
          <p className="muted small center">A música muda de dia, de noite e quando você visita um amigo. As escolhas ficam salvas para a sua conta neste aparelho.</p>
        </Dialog>
      )}
      {panel === 'friends' && <FriendsDialog me={{ ...me, level }} neighbors={data.neighbors} inventory={data.inventory} busy={busy} act={act}
        onGift={(to) => { setWant({ giftTo: to }); setPanel('gifts') }} onClose={close} />}
      {panel === 'feed' && (
        <MuralDialog events={data.events} seenId={seenId ?? 0} text={eventText} onClose={() => { markSeen(); close() }}
          banner={ev ? { src: ev.banner, text: ev.tagline, box: ev.bannerText, onOpen: () => setPanel('event') } : undefined}
          extra={(e) => e.kind === 'bitten' && e.actor ? (
            <button className="btn green small" onClick={() => sendShare('mordida', BITE_LINES.ownerShare(e.actor!, GAME_NAME), inviteLink(me.inviteCode))}>Compartilhar</button>
          ) : null} />
      )}
      {panel === 'away' && (
        <AwayDialog events={data.events} seenId={seenId ?? 0} onMural={() => setPanel('feed')} onClose={() => { markSeen(); close() }} />
      )}
      {panel === 'help' && <HelpDialog onClose={close} />}
      {meatSlot && (() => {
        const a = data.livestock.find((x) => x.slot === meatSlot)
        return a?.ready && data.isOwn ? (
          <MeatConfirmDialog name={a.name} busy={busy} onClose={() => setMeatSlot(null)}
            onConfirm={async () => { await act({ type: 'collect_animal', slot: meatSlot }); setMeatSlot(null) }} />
        ) : null
      })()}
      {!panel && bonus && <DailyBonusDialog bonus={bonus} onShare={shareNow('bonus')} onClose={() => setBonus(null)} />}
      {!panel && !bonus && levelUp && (
        <LevelUpDialog level={levelUp} onClose={() => setLevelUp(null)}
          onShare={me.inviteCode ? () => sendShare('levelup', levelUpShareText(levelUp, GAME_NAME), levelUpLink(me.inviteCode!, levelUp)) : undefined} />
      )}
      {/* No modo decoração o balão cobria a barra de edição e a grade (celular); volta quando sai do modo. */}
      {coach.step && coach.index != null && !panel && !bonus && !levelUp && !editing && (data.isOwn || !OWN_FARM_STEPS.has(coach.step.id)) && (
        <CoachBubble step={coach.step} index={coach.index} total={coach.total} onSkip={coach.finish}
          onInvite={() => { sendShare('convite', `Bora jogar ${GAME_NAME} comigo? Planta, colhe e (com jeitinho) pega da minha horta 😄`, inviteLink(me.inviteCode)); coach.finish() }} />
      )}
      {/* Espera o tutorial acabar: no celular os dois balões se sobrepunham e o pedido tapava a roça (engolia o toque no lote). */}
      {push.ask && !panel && !coach.step && !editing && (
        <div className="share-hook push-ask" role="dialog" aria-label="Avisos">
          <b>🔔 {push.state === 'ios-install' ? 'Quer receber avisos?' : 'Te aviso quando a horta ficar pronta?'}</b>
          <small>{push.state === 'ios-install'
            ? 'No iPhone, adicione o jogo à Tela de Início (Compartilhar ⬆️ → Adicionar à Tela de Início) e ative os avisos no menu Mais.'
            : 'E quando alguém estiver roubando você. Só o que importa, sem spam.'}</small>
          <div className="row">
            {push.state !== 'ios-install' && <button className="btn green small" onClick={() => void answerPush(true)}>Avisar</button>}
            <button className="btn small" onClick={() => void answerPush(false)}>{push.state === 'ios-install' ? 'Entendi' : 'Agora não'}</button>
          </div>
        </div>
      )}
      {hook && !panel && !coach.step && !push.ask && (
        <div className="share-hook" role="status">
          <b>{hook.title}</b>
          <div className="row">
            <button className="btn green small" onClick={() => { sendShare(hook.place, hook.text, inviteLink(me.inviteCode)); setHook(null) }}>Chamar no WhatsApp</button>
            <button className="close small" aria-label="Fechar" onClick={() => setHook(null)}>×</button>
          </div>
        </div>
      )}
      {tool.id !== 'arrow' && (
        <div className="tool-hint">
          {tool.id === 'seed' ? `Plantando ${SEED_BY_ID[tool.seedId!].name} (${qtyOf(seedItem(tool.seedId!))})` : tool.id === 'fertilizer' ? `${itemName(tool.itemId ?? 'adubo')} (${qtyOf(tool.itemId ?? 'adubo')})` : null}
          <button className="btn small" onClick={() => setTool(ARROW)}>Soltar ferramenta<span className="kbd-hint"> (Esc)</span></button>
        </div>
      )}
      {!shown && (owner
        ? <div className="scene-cover"><VisitLoading owner={owner} /></div>
        : <div className="scene-cover loading" role="status"><span className="loading-text">Carregando informações da fazenda…</span></div>)}
    </main>
  )
}

/** Passos do tutorial que só fazem sentido na própria fazenda (na visita o balão tapava a horta do amigo). */
const OWN_FARM_STEPS = new Set(['plant', 'sell', 'invite'])

/**
 * Barra de vizinhos (amigos e vizinhos do jogo): só redesenha quando a lista muda, não a cada segundo do relógio
 * do jogo nem a cada ação no lote (medido: era a maior parte do quadro de um toque no celular).
 */
const NeighborBar = memo(function NeighborBar({ neighbors, isOwn, current, onLogout }: {
  neighbors: FarmPayload['neighbors']; isOwn: boolean; current: string; onLogout: () => void
}) {
  // Só amigos e os vizinhos do jogo (friend já inclui os bots). Quem não é amigo fica na sugestão da janela Amigos.
  neighbors = neighbors.filter((n) => n.friend)
  return (
    <section className="neighbors" aria-label="Vizinhos">
      <HScroll className="nb-strip" label="Vizinhos e amigos">
        {isOwn ? null : <Link href="/fazenda" className="nb me"><span className="nb-av">🏠</span><span>Minha</span></Link>}
        {neighbors.map((n) => (
          <Link key={n.handle} href={`/fazenda/${n.handle}`} className={`nb ${n.handle === current ? 'on' : ''} ${n.friend && n.ripe > 0 ? 'ripe' : ''}`}
            title={n.friend && n.ripe > 0 ? `${n.handle}: horta madura, ${n.ripe} ${n.ripe > 1 ? 'lotes' : 'lote'}. Corre lá!` : n.handle}>
            <span className="nb-av">
              <Avatar id={n.avatar} handle={n.handle} />
              {n.ripe > 0 ? <i title="Tem coisa madura">✋</i> : n.needsHelp > 0 ? <i className="help" title="Precisa de ajuda">🆘</i> : null}
              {n.online && <b className="online" title="Online agora" />}
            </span>
            <span className="nb-name">{n.handle}</span>
            {n.friend && n.ripe > 0 ? <small className="ripe-tag">Madura!</small> : <small>Nv {n.level}</small>}
          </Link>
        ))}
        {neighbors.length === 0 && <p className="muted">Ninguém por aqui ainda.</p>}
        <a className="nb exit" href="/conta" title="Minha conta: e-mail, sair de todos os aparelhos, meus dados">
          <span className="nb-av">👤</span><span>Conta</span>
        </a>
        <button className="nb exit" onClick={onLogout}>
          <span className="nb-av">↩</span><span>Sair</span>
        </button>
      </HScroll>
    </section>
  )
})

/** Assistente (canto de cima): o que pede atenção na sua fazenda; o toque pega a ferramenta certa. */
function Assistant({ items, onPick }: { items: AssistItem[]; onPick: (i: AssistItem) => void }) {
  if (!items.length) return null
  return (
    <div className="assist" role="status" aria-label="Assistente da fazenda">
      <span className="assist-title" title="Assistente"><Icon name="assistant" emoji="🌾" size={64} /><span className="sr-only">Assistente:</span></span>
      {items.map((i) => (
        <button key={i.key} className="assist-chip" onClick={() => onPick(i)} title={i.text}>
          <span aria-hidden>{i.icon}</span> {i.text}
        </button>
      ))}
    </div>
  )
}
