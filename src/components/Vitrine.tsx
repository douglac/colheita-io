'use client'
// Vitrine da página inicial: contador de quem está plantando agora e "Fazendas em destaque" (Top 10 só com as
// iniciais). Os dados chegam já no HTML (sem pular o formulário) e se atualizam a cada minuto. Tocar numa linha abre
// a fazenda em tela cheia (/espiar/[token], FarmPeekScreen): a cena de verdade, só para olhar, sem link para a
// fazenda real. Ao voltar, a LP volta para a mesma rolagem (ou foca o e-mail, se a pessoa quis entrar).
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { avatarSrc } from '@/game/avatar'
import { fmtGold } from '@/game/catalog'
import type { Board, VitrineData, VitrineRow } from '@/server/vitrine'
import { onlineLabel, PEEK_FROM, PEEK_JOIN, PEEK_SCROLL, peekHref } from '@/game/vitrine-text'
import { ArtSeal } from './ui/kit'

const REFRESH_MS = 60_000

const Ctx = createContext<VitrineData | null>(null)

/** Guarda os dados da vitrine e os renova a cada minuto (só com a aba visível). */
export function VitrineLive({ initial, children }: { initial: VitrineData | null; children: ReactNode }) {
  const [data, setData] = useState(initial)
  useEffect(() => {
    let alive = true
    const load = async () => {
      if (document.hidden) return
      const r = await fetch('/api/vitrine').catch(() => null)
      if (alive && r?.ok) setData(await r.json())
    }
    if (!initial) void load()
    const t = setInterval(load, REFRESH_MS)
    const vis = () => { if (!document.hidden) void load() }
    document.addEventListener('visibilitychange', vis)
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', vis) }
  }, [initial])
  return <Ctx.Provider value={data}>{children}</Ctx.Provider>
}

/** "🟢 23 pessoas plantando agora" ou, abaixo do mínimo, "Fazendas abertas agora". Sempre uma linha: não mexe no layout. */
export function OnlineNow() {
  const data = useContext(Ctx)
  return (
    <p className="online-now" role="status" aria-live="polite">
      <span className="online-dot" aria-hidden />{onlineLabel(data?.online ?? null)}
    </p>
  )
}

const TABS: { id: Board; name: string }[] = [
  { id: 'nivel', name: 'Nível' },
  { id: 'moedas', name: 'Moedas' },
  { id: 'popularidade', name: 'Popularidade' },
]
// Compacto ("158 mil"): cabe na linha do celular de 360 px.
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
const valueOf: Record<Board, (r: VitrineRow) => string> = {
  nivel: (r) => `${compact.format(r.value)} EXP`,
  moedas: (r) => `🪙 ${r.value < 10_000 ? fmtGold(r.value) : compact.format(r.value)}`,
  popularidade: (r) => `♥ ${compact.format(r.value)}`,
}

export function FeaturedFarms() {
  const data = useContext(Ctx)
  const [tab, setTab] = useState<Board>('nivel')
  const router = useRouter()
  useEffect(backFromPeek, [])
  const open = (r: VitrineRow) => {
    sessionStorage.setItem(PEEK_FROM, r.token)
    sessionStorage.setItem(PEEK_SCROLL, String(Math.round(window.scrollY)))
    router.push(peekHref(r.token))
  }
  const rows = data?.boards[tab] ?? []
  const empty = !!data && Object.values(data.boards).every((b) => b.length === 0)
  return (
    <section className="farm-panel featured" aria-labelledby="featured-title">
      <h2 id="featured-title">🏆 Fazendas em destaque</h2>
      {!data ? (
        <p className="featured-empty">Carregando as fazendas…</p>
      ) : empty ? (
        <p className="featured-empty">Seja o primeiro a aparecer aqui! 🌱</p>
      ) : (
        <>
          <div className="featured-tabs" role="tablist" aria-label="Ordenar por">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={t.id === tab} className={`tab ${t.id === tab ? 'on' : ''}`} onClick={() => setTab(t.id)}>{t.name}</button>
            ))}
          </div>
          {rows.length === 0 ? <p className="featured-empty">Ninguém nesta lista ainda.</p> : (
            <ol className="featured-list">
              {rows.map((r) => (
                <li key={r.token}>
                  <button className="featured-row" onClick={() => open(r)} aria-label={`${r.pos}º lugar, ${r.initials}, nível ${r.level}: ver a fazenda`}>
                    {r.pos <= 3
                      ? <ArtSeal src={`/art/ui/rank_${r.pos}.png`} className={`pos p${r.pos}`} label={`${r.pos}º lugar`}>{r.pos}</ArtSeal>
                      : <span className="pos">{r.pos}</span>}
                    <img className="featured-av" src={avatarSrc(r.avatar)} width={36} height={36} alt="" />
                    <b className="featured-initials">{r.initials}</b>
                    <span className="featured-lv">Nv {r.level}</span>
                    <span className="featured-val">{valueOf[tab](r)}</span>
                    <span className="featured-eye" aria-hidden>👀</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          <small className="featured-note">Só as iniciais. Toque para espiar a fazenda.</small>
        </>
      )}
    </section>
  )
}

/** De volta da tela cheia: a mesma rolagem de antes, ou o campo de e-mail com foco ("Entrar e plantar a sua"). */
// Lê e apaga os recados só no quadro seguinte: no modo estrito o efeito roda, desmonta e roda de novo.
function backFromPeek() {
  const raf = requestAnimationFrame(() => {
    const y = sessionStorage.getItem(PEEK_SCROLL), join = sessionStorage.getItem(PEEK_JOIN)
    for (const k of [PEEK_FROM, PEEK_SCROLL, PEEK_JOIN]) sessionStorage.removeItem(k)
    if (join) {
      const input = document.querySelector<HTMLInputElement>('.entry-panel input')
      input?.scrollIntoView({ block: 'center' })
      input?.focus({ preventScroll: true })
    } else if (y) window.scrollTo(0, Number(y))
  })
  return () => cancelAnimationFrame(raf)
}
