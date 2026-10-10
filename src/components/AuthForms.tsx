'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { AGE_BANDS, ageFrom, bandFromAge, needsGuardian, type AgeBand } from '@/game/age'
import type { AvatarId } from '@/game/avatar'
import { AvatarPicker } from './Avatar'

async function post(url: string, body: unknown): Promise<{ ok: boolean; data: { error?: string; next?: string; email?: string } }> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { ok: res.ok, data: await res.json().catch(() => ({ error: 'Erro de conexão. Tente de novo.' })) }
}

/**
 * Teclado do celular (iOS Safari, Chrome Android): o teclado só encolhe o visualViewport, e o campo focado ou o botão
 * de enviar podiam ficar atrás dele. No foco (e a cada mudança do teclado), reserva embaixo da tela a altura do teclado
 * (--kb, usado em .farm-screen) e rola o campo focado para a parte visível; com data-keep="submit", rola até o botão de
 * enviar também caber. `key` troca quando o formulário é outro (e-mail → código).
 */
function useKeyboardSafe(key?: unknown) {
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    const form = ref.current, vv = window.visualViewport
    if (!form || !vv) return
    const root = document.documentElement
    let timer = 0
    const fit = () => {
      const el = document.activeElement
      if (!(el instanceof HTMLElement) || !form.contains(el) || !el.matches('input:not([type=checkbox]), select')) return
      root.style.setProperty('--kb', `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`)
      const keep = form.dataset.keep === 'submit' ? form.querySelector('button:not([type=button])') ?? el : el
      const top = el.getBoundingClientRect().top, bottom = keep.getBoundingClientRect().bottom
      const viewTop = vv.offsetTop + 8, viewBottom = vv.offsetTop + vv.height - 12
      const dy = bottom > viewBottom ? Math.min(bottom - viewBottom, top - viewTop) : top < viewTop ? top - viewTop : 0
      if (dy) window.scrollBy({ top: dy, behavior: 'smooth' })
    }
    const later = () => { clearTimeout(timer); timer = window.setTimeout(fit, 150) } // espera o teclado terminar de subir
    const out = () => setTimeout(() => { if (!form.contains(document.activeElement)) root.style.removeProperty('--kb') }, 0)
    form.addEventListener('focusin', later)
    form.addEventListener('focusout', out)
    vv.addEventListener('resize', later)
    if (form.contains(document.activeElement)) later()
    return () => {
      clearTimeout(timer)
      form.removeEventListener('focusin', later)
      form.removeEventListener('focusout', out)
      vv.removeEventListener('resize', later)
      root.style.removeProperty('--kb')
    }
  }, [key])
  return ref
}

/** Caixa do código: 6 números, aceita colar, envia sozinha ao completar. */
function CodeInput({ value, onChange, onComplete, disabled }: { value: string; onChange: (v: string) => void; onComplete: (v: string) => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  // Sem maxLength nativo: ele cortaria "123 456" antes de onChange limpar o espaço.
  // O limite vem depois da limpeza, inclusive em colagem e preenchimento automático.
  return (
    <input ref={ref} className="code-input" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}"
      placeholder="000000" aria-label="Código de 6 números" value={value} disabled={disabled} required
      onChange={(e) => {
        const v = e.target.value.replace(/\D/g, '').slice(0, 6)
        onChange(v)
        if (v.length === 6) onComplete(v)
      }} />
  )
}

/**
 * Entrar com e-mail (também usado para ligar e-mail a uma conta antiga e para confirmar a exclusão).
 * Passo 1: e-mail. Passo 2: código de 6 números (ou o botão do e-mail).
 */
export function EmailLogin({ purpose = 'login', fixedEmail, submitLabel = 'Receber código', onDone }: {
  purpose?: 'login' | 'link' | 'delete'; fixedEmail?: string; submitLabel?: string; onDone?: (next: string) => void
}) {
  const router = useRouter()
  const [email, setEmail] = useState(fixedEmail ?? '')
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const verifying = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  // Celular lento: o que foi digitado antes do React carregar não pode sumir.
  const emailRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (emailRef.current?.value) setEmail(emailRef.current.value) }, [])
  const formRef = useKeyboardSafe(sent)

  const request = async () => {
    setBusy(true); setError(null); setInfo(null)
    const r = await post('/api/auth/request', { email, purpose })
    setBusy(false)
    if (!r.ok) { setError(r.data.error ?? 'Não deu certo. Tente de novo.'); return }
    if (sent) setInfo('Mandamos um código novo. O anterior não vale mais.')
    setSent(true); setCode('')
  }
  const verify = async (c: string) => {
    // Trava síncrona: completar o campo e enviar o form podem ocorrer antes do próximo render.
    if (busy || verifying.current || !/^\d{6}$/.test(c)) return
    verifying.current = true
    setBusy(true); setError(null); setInfo(null)
    try {
      const r = await post('/api/auth/verify', { email, code: c, purpose })
      if (r.ok) {
        if (onDone) onDone(r.data.next ?? '/')
        else router.replace(r.data.next ?? '/fazenda')
        return // mantém a trava até a navegação, também nos consumidores com onDone
      }
      setError(r.data.error ?? 'Não deu certo.')
    } catch {
      setError('Erro de conexão. Tente de novo.')
    }
    verifying.current = false
    setBusy(false); setCode('')
  }

  if (!sent) {
    return (
      // method="post": se enviar antes de o React carregar, o e-mail não vai parar na URL.
      <form ref={formRef} data-keep="submit" className="login-form" method="post" onSubmit={(e) => { e.preventDefault(); void request() }}>
        {!fixedEmail && (
          <input ref={emailRef} name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off"
            spellCheck={false} enterKeyHint="send" placeholder="seu@email.com" value={email}
            onChange={(e) => setEmail(e.target.value)} maxLength={254} required aria-label="Seu e-mail" />
        )}
        <button className={`btn big${purpose === 'delete' ? ' danger' : ''}`} disabled={busy}>{busy ? 'Enviando…' : submitLabel}</button>
        {error && <p className="warn" role="alert">{error}</p>}
      </form>
    )
  }
  return (
    <form ref={formRef} data-keep="submit" className="login-form" onSubmit={(e) => { e.preventDefault(); void verify(code) }}>
      <p className="sent-note">📬 Mandamos um código para <b>{email}</b>. Digite aqui ou toque no botão do e-mail.</p>
      <CodeInput value={code} onChange={setCode} onComplete={(v) => void verify(v)} disabled={busy} />
      <button className={`btn big${purpose === 'delete' ? ' danger' : ''}`} disabled={busy || code.length !== 6}>
        {busy ? 'Conferindo…' : purpose === 'delete' ? 'Excluir para sempre' : purpose === 'link' ? 'Confirmar e-mail' : 'Entrar'}
      </button>
      {error && <p className="warn" role="alert">{error}</p>}
      {info && <p className="muted small">{info}</p>}
      <p className="muted small">
        Não chegou? Olhe o spam ou{' '}
        <button type="button" className="linklike" onClick={() => void request()} disabled={busy}>mande outro código</button>
        {!fixedEmail && <> · <button type="button" className="linklike" onClick={() => { setSent(false); setError(null) }}>trocar e-mail</button></>}
      </p>
    </form>
  )
}

/** Página do link mágico: um toque confirma (antivírus de e-mail que abre links não gasta o link). */
export function LinkConfirm({ token, label, danger }: { token: string; label: string; danger?: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="login-form">
      <button className={`btn big${danger ? ' danger' : ''}`} disabled={busy} onClick={async () => {
        setBusy(true); setError(null)
        const r = await post('/api/auth/verify', { token })
        if (r.ok) router.replace(r.data.next ?? '/fazenda')
        else { setBusy(false); setError(r.data.error ?? 'Não deu certo.') }
      }}>{busy ? 'Um instante…' : label}</button>
      {error && <><p className="warn" role="alert">{error}</p><Link className="btn" href="/">Pedir um código novo</Link></>}
    </div>
  )
}

/** Primeiro acesso: apelido da fazenda, idade e aceite dos termos. */
export function SignupForm({ email, inviter }: { email: string; inviter?: string | null }) {
  const router = useRouter()
  const [handle, setHandle] = useState('')
  const [useBand, setUseBand] = useState(false)
  const [birthDate, setBirthDate] = useState('')
  const [ageBand, setAgeBand] = useState<AgeBand | ''>('')
  const [guardian, setGuardian] = useState(false)
  const [terms, setTerms] = useState(false)
  const [avatar, setAvatar] = useState<AvatarId | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const age = !useBand && birthDate ? ageFrom(birthDate) : null
  const band: AgeBand | null = useBand ? ageBand || null : age != null ? bandFromAge(age) : null
  const today = new Date().toISOString().slice(0, 10)
  const formRef = useKeyboardSafe()
  return (
    <form ref={formRef} className="login-form signup-form" onSubmit={async (e) => {
      e.preventDefault()
      setBusy(true); setError(null)
      let origem: string | null = null
      try { origem = localStorage.getItem('cf:origem') } catch { /* sem armazenamento */ }
      const r = await post('/api/auth/signup', {
        handle, acceptTerms: terms, guardianConsent: guardian, avatar, origem,
        ...(useBand ? { ageBand } : { birthDate }),
      })
      if (r.ok) { try { localStorage.removeItem('cf:origem') } catch { /* idem */ } }
      if (r.ok) router.replace(r.data.next ?? '/fazenda')
      else { setBusy(false); setError(r.data.error ?? 'Não deu certo.') }
    }}>
      <p className="sent-note">✅ E-mail confirmado: <b>{email}</b>{inviter ? <><br />Convite de <b>{inviter}</b>: vocês dois ganham ouro.</> : null}</p>

      <label className="field">
        <span>Apelido do fazendeiro</span>
        <input name="handle" placeholder="seu_apelido" value={handle} autoComplete="off" autoCapitalize="none" required minLength={3} maxLength={20}
          onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} />
        <small className="muted">3 a 20 letras, números ou _. É o nome que os amigos veem.</small>
      </label>

      <div className="field">
        <span>Seu rosto de fazendeiro</span>
        <AvatarPicker value={avatar} onPick={setAvatar} />
        <small className="muted">Aparece no topo da fazenda e para os amigos. Dá para trocar depois em Minha conta.</small>
      </div>

      {!useBand ? (
        <label className="field">
          <span>Data de nascimento</span>
          <input name="birthDate" type="date" value={birthDate} max={today} min="1900-01-01" required onChange={(e) => setBirthDate(e.target.value)} />
          <button type="button" className="linklike small" onClick={() => setUseBand(true)}>Prefiro dizer só a faixa de idade</button>
        </label>
      ) : (
        <label className="field">
          <span>Faixa de idade</span>
          <select name="ageBand" value={ageBand} required onChange={(e) => setAgeBand(e.target.value as AgeBand)}>
            <option value="" disabled>Escolha…</option>
            {AGE_BANDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
          <button type="button" className="linklike small" onClick={() => setUseBand(false)}>Informar a data de nascimento</button>
        </label>
      )}

      {band === 'lt13' && <p className="warn">A fazenda é para quem tem 13 anos ou mais.</p>}
      {band && needsGuardian(band) && (
        <label className="check">
          <input type="checkbox" checked={guardian} onChange={(e) => setGuardian(e.target.checked)} required />
          <span>Meu pai, mãe ou responsável sabe e autorizou que eu jogue.</span>
        </label>
      )}
      {band && band !== '18p' && band !== 'lt13' && <p className="muted small">Compras com dinheiro ficam bloqueadas para menores de 18 anos.</p>}

      <label className="check">
        <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} required />
        <span>Li e aceito os Termos de Uso e a Política de Privacidade.</span>
      </label>
      {/* Links fora do <label>: no celular, o toque na frase caía no link (abria outra aba) em vez de marcar a caixa. */}
      <p className="terms-links small">Ler: <Link href="/termos" target="_blank">Termos de Uso</Link> · <Link href="/privacidade" target="_blank">Política de Privacidade</Link></p>

      <button className="btn big" disabled={busy || band === 'lt13'}>{busy ? 'Preparando a terra…' : 'Começar minha fazenda 🌱'}</button>
      {error && <p className="warn" role="alert">{error}</p>}
    </form>
  )
}

/** Tela "Minha conta": e-mail, sair, sair de todos, baixar dados, excluir conta. */
export function AccountPanel({ handle, email, sessions, testLogin, avatar: initialAvatar, publicRanking, minor }: {
  handle: string; email: string | null; sessions: number; testLogin: boolean; avatar: AvatarId
  publicRanking: boolean; minor: boolean // vitrine da página inicial (só as iniciais); menor de 18 nunca aparece
}) {
  const router = useRouter()
  const [avatar, setAvatar] = useState<AvatarId>(initialAvatar)
  const [ranking, setRanking] = useState(publicRanking)
  const [rankingNote, setRankingNote] = useState<string | null>(null)
  const [avatarNote, setAvatarNote] = useState<string | null>(null)
  const [mode, setMode] = useState<null | 'link' | 'delete'>(null)
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const logout = async (all: boolean) => {
    await post('/api/logout', { all })
    router.replace('/')
  }
  return (
    <div className="account">
      <section className="card">
        <h2>🧑‍🌾 Seu rosto</h2>
        <AvatarPicker value={avatar} onPick={async (id) => {
          const before = avatar
          setAvatar(id); setAvatarNote(null)
          const r = await post('/api/conta/avatar', { avatar: id })
          if (r.ok) setAvatarNote('Rosto trocado! Os amigos já veem o novo.')
          else { setAvatar(before); setAvatarNote(r.data.error ?? 'Não deu certo.') }
        }} />
        {avatarNote && <p className="muted small" role="status">{avatarNote}</p>}
      </section>

      <section className="card">
        <h2>🔐 Entrada</h2>
        {email ? (
          <p>Você entra com <b>{email}</b>, sem senha: a cada entrada mandamos um código.</p>
        ) : mode === 'link' ? (
          <>
            <p>Ligue um e-mail para entrar de qualquer aparelho. A fazenda continua a mesma.</p>
            <EmailLogin purpose="link" submitLabel="Mandar código" onDone={(next) => { router.replace(next); router.refresh() }} />
          </>
        ) : (
          <>
            <p className="warn">Esta fazenda ainda não tem e-mail. Sem ele, você pode perder o acesso.</p>
            <button className="btn big" onClick={() => setMode('link')}>Ligar um e-mail</button>
          </>
        )}
        <div className="row">
          <button className="btn" onClick={() => void logout(false)}>↩ Sair</button>
          <button className="btn" onClick={() => void logout(true)}>📱 Sair de todos os aparelhos{sessions > 1 ? ` (${sessions})` : ''}</button>
        </div>
      </section>

      <section className="card">
        <h2>🏆 Ranking público</h2>
        <label className="check">
          <input type="checkbox" checked={ranking} onChange={async (e) => {
            const on = e.target.checked
            setRanking(on); setRankingNote(null)
            const r = await post('/api/conta/vitrine', { on })
            if (r.ok) setRankingNote(on ? 'Sua fazenda pode aparecer na página inicial, só com as iniciais.' : 'Pronto: sua fazenda saiu do ranking público.')
            else { setRanking(!on); setRankingNote(r.data.error ?? 'Não deu certo.') }
          }} />
          <span>Mostrar minha fazenda no ranking público (só as iniciais)</span>
        </label>
        <p className="muted small">Quem ainda não joga vê as iniciais, o nível e uma prévia da fazenda, sem o seu apelido e sem poder entrar nela.{minor ? ' Menores de 18 anos não aparecem no ranking público.' : ''}</p>
        {rankingNote && <p className="muted small" role="status">{rankingNote}</p>}
      </section>

      <section className="card">
        <h2>📦 Seus dados</h2>
        <p>Baixe tudo o que o jogo guarda sobre você (fazenda, celeiro, amigos, mural, compras) num arquivo JSON.</p>
        <a className="btn" href="/api/conta/dados" download>⬇️ Baixar meus dados</a>
      </section>

      <section className="card danger-zone">
        <h2>🗑️ Excluir conta</h2>
        <p>Apaga para sempre a fazenda <b>{handle}</b>, o celeiro, os bichos, o ouro e as amizades. Nos murais dos amigos, o que você fez aparece como “Alguém”. Quem você convidou continua jogando.</p>
        {mode !== 'delete' ? (
          <button className="btn danger" onClick={() => setMode('delete')}>Quero excluir minha conta</button>
        ) : email ? (
          <>
            <p>Para ter certeza de que é você, mandamos um código para <b>{email}</b>.</p>
            <EmailLogin purpose="delete" fixedEmail={email} submitLabel="Mandar código de confirmação" onDone={(next) => router.replace(next)} />
          </>
        ) : testLogin ? (
          <form className="login-form" onSubmit={async (e) => {
            e.preventDefault(); setError(null)
            const r = await post('/api/conta/excluir', { confirm })
            if (r.ok) router.replace(r.data.next ?? '/')
            else setError(r.data.error ?? 'Não deu certo.')
          }}>
            <p className="muted small">Conta de teste (sem e-mail): digite <b>{handle}</b> para confirmar.</p>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={handle} autoCapitalize="none" />
            <button className="btn danger" disabled={confirm.trim().toLowerCase() !== handle}>Excluir para sempre</button>
            {error && <p className="warn">{error}</p>}
          </form>
        ) : (
          <p className="warn">Ligue um e-mail à conta para confirmar a exclusão.</p>
        )}
      </section>
    </div>
  )
}
