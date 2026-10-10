'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PEEK_FROM, peekHref, rankingReturn } from '@/game/vitrine-text'
import type { Board, VitrineData, VitrineRow } from '@/server/vitrine'
import { PublicFarmList } from './Vitrine'

/** Montado só na aba Pública: uma busca, cancelada ao sair; nenhum polling. */
export function PublicRanking({ board }: { board: Board }) {
  const router = useRouter()
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ data: VitrineData } | { error: true } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const res = await fetch('/api/vitrine', { signal: controller.signal })
        if (!res.ok) throw new Error('ranking')
        const data: VitrineData = await res.json()
        if (!controller.signal.aborted) setResult({ data })
      } catch {
        if (!controller.signal.aborted) setResult({ error: true })
      }
    }
    void load()
    return () => controller.abort()
  }, [attempt])
  const open = (row: VitrineRow) => {
    const back = rankingReturn(`${window.location.pathname}?ranking=${board}`)
    if (!back) return
    // A entrada atual do histórico guarda o contexto; X, Escape e Voltar reabrem a categoria certa.
    window.history.replaceState(null, '', back)
    sessionStorage.setItem(PEEK_FROM, row.token)
    router.push(`${peekHref(row.token)}?voltar=${encodeURIComponent(back)}`)
  }
  return <>
    <p className="muted small">Top 10 público · {board === 'nivel' ? 'Nível' : board === 'moedas' ? 'Moedas' : 'Popularidade'}. Só as iniciais; toque para espiar.</p>
    {!result ? <p role="status">Carregando o ranking público…</p> : 'error' in result ? <div role="alert">
      <p>Não foi possível carregar o ranking público.</p>
      <button className="btn" onClick={() => { setResult(null); setAttempt((n) => n + 1) }}>Tentar novamente</button>
    </div> : result.data.boards[board].length === 0 ? <p role="status">Ninguém nesta lista ainda.</p> :
      <PublicFarmList rows={result.data.boards[board]} board={board} onOpen={open} />}
  </>
}
