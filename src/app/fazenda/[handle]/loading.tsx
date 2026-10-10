'use client'
import { useParams } from 'next/navigation'
import { VisitLoading } from '@/components/VisitLoading'

// Enquanto o servidor monta a página da visita: a mesma tela que o jogo mostra ao buscar a fazenda.
export default function Loading() {
  const { handle } = useParams<{ handle: string }>()
  return <main className="game"><VisitLoading owner={decodeURIComponent(handle ?? '')} /></main>
}
