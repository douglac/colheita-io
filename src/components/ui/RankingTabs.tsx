'use client'
import { useId, type ReactNode } from 'react'

/** Abas com seleção anunciada e navegação por setas, Home e End. */
export function RankingTabs<T extends string>({ label, tabs, tab, onTab, children }: {
  label: string; tabs: { id: T; name: string }[]; tab: T; onTab: (tab: T) => void; children: ReactNode
}) {
  const id = useId()
  return <>
    <div className="ranking-tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => <button key={t.id} type="button" id={`${id}-${t.id}`} role="tab"
        aria-selected={t.id === tab} aria-controls={`${id}-panel`} tabIndex={t.id === tab ? 0 : -1}
        className={`tab ${t.id === tab ? 'on' : ''}`} onClick={() => onTab(t.id)} onKeyDown={(e) => {
          const next = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null
          if (next == null) return
          e.preventDefault()
          onTab(tabs[next].id)
          document.getElementById(`${id}-${tabs[next].id}`)?.focus()
        }}>{t.name}</button>)}
    </div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} tabIndex={0}>{children}</div>
  </>
}
