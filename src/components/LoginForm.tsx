'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function LoginForm() {
  const router = useRouter()
  const [handle, setHandle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="login-form"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError(null)
        const res = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ handle }) })
        setBusy(false)
        if (res.ok) router.replace('/fazenda')
        else setError((await res.json()).error)
      }}
    >
      <input name="handle" placeholder="seu_apelido" value={handle} autoComplete="off" autoCapitalize="none"
        onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} maxLength={20} required />
      <button className="btn big" disabled={busy}>Entrar na fazenda</button>
      {error && <p className="warn">{error}</p>}
    </form>
  )
}
