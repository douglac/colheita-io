'use client'
import { useEffect, useState } from 'react'

// Tutorial da 1ª sessão (~2 min): o vizinho Seu Zé guia o loop principal do jogo —
// plantar → visitar → pegar da horta alheia → colher → vender → chamar um amigo.
// Avança sozinho pelas ações do jogador; nunca bloqueia; dá para pular.

export type CoachEvent = { action?: string; ok?: boolean; isOwn: boolean }

type Step = { id: string; text: string; done: (e: CoachEvent) => boolean; target?: string }

const STEPS: Step[] = [
  { id: 'plant', text: 'Opa, vizinho! Toque num lote de terra e escolha o Nabo pra plantar. Ele fica pronto rapidinho.',
    done: (e) => e.action === 'plant' && !!e.ok },
  { id: 'visit', text: 'Enquanto cresce, dá uma passada na horta da Dona Cida. Toque em Amigos (ou no nome dela lá embaixo).',
    done: (e) => !e.isOwn, target: 'friends' },
  { id: 'steal', text: 'Viu as mãozinhas ✋? É coisa madura. Toque num desses lotes e pega um pouquinho… ela nem vai perceber 😏',
    done: (e) => e.action === 'steal' && !!e.ok },
  { id: 'harvest', text: 'Agora volta pra sua fazenda (botão Voltar). Quando o nabo amadurecer, toque nele pra colher.',
    done: (e) => e.action === 'harvest' && !!e.ok },
  { id: 'sell', text: 'Abra o Depósito e venda a colheita. Com o ouro você compra sementes melhores na Loja.',
    done: (e) => (e.action === 'sell' || e.action === 'sell_all') && !!e.ok, target: 'barn' },
  { id: 'invite', text: 'Fazenda boa é fazenda com vizinho! Chame um amigo: cada um ganha +50 de ouro. E cuidado, que ele vai querer roubar você também…',
    done: () => false, target: 'friends' },
]

const key = (handle: string) => `cf:coach:${handle}`

export function useCoach(handle: string | undefined, level: number) {
  const [step, setStep] = useState<number | null>(null)
  useEffect(() => {
    if (!handle) return
    const saved = localStorage.getItem(key(handle))
    // Só para quem está começando; quem já passou do nível 3 não vê.
    if (saved === 'done' || (saved == null && level > 3)) return setStep(null)
    setStep(saved == null ? 0 : Math.min(Number(saved) || 0, STEPS.length - 1))
  }, [handle, level])

  const save = (n: number | 'done') => { if (handle) localStorage.setItem(key(handle), String(n)) }
  const advance = (e: CoachEvent) => {
    setStep((cur) => {
      if (cur == null || !STEPS[cur].done(e)) return cur
      const next = cur + 1
      save(next)
      return next
    })
  }
  const finish = () => { save('done'); setStep(null) }
  return { step: step == null ? null : STEPS[step], index: step, total: STEPS.length, advance, finish }
}

export function CoachBubble({ step, index, total, onSkip, onInvite }: {
  step: Step; index: number; total: number; onSkip: () => void; onInvite: () => void
}) {
  return (
    <div className="coach" role="status" aria-live="polite">
      <span className="coach-face" aria-hidden>👨‍🌾</span>
      <div className="coach-body">
        <small>Seu Zé · {index + 1}/{total}</small>
        <p>{step.text}</p>
        <div className="row">
          {step.id === 'invite' && <button className="btn green small" onClick={onInvite}>Chamar no WhatsApp</button>}
          <button className="linkish" onClick={onSkip}>{step.id === 'invite' ? 'Agora não' : 'Pular tutorial'}</button>
        </div>
      </div>
    </div>
  )
}
