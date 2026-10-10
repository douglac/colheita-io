import { NextResponse } from 'next/server'
import { deleteAccount } from '@/server/account'
import { getDb } from '@/server/db'
import { testLoginEnabled } from '@/server/flags'
import { currentUser, SESSION_COOKIE } from '@/server/session'

// Excluir conta SEM e-mail ligado (só contas do login de teste, só onde o login de teste está ligado):
// a confirmação é digitar o apelido. Conta com e-mail confirma pelo código (/api/auth/request purpose=delete).
export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Faça login' }, { status: 401 })
  const row = (await (await getDb()).query<{ email: string | null }>('select email from users where id = $1', [user.id])).rows[0]
  if (row?.email || !testLoginEnabled()) return NextResponse.json({ error: 'Confirme pelo código enviado ao seu e-mail.' }, { status: 400 })
  const { confirm } = (await req.json().catch(() => ({}))) as { confirm?: string }
  if (String(confirm ?? '').trim().toLowerCase() !== user.handle) return NextResponse.json({ error: 'Digite o apelido da fazenda para confirmar.' }, { status: 400 })
  await deleteAccount(user.id)
  const res = NextResponse.json({ ok: true, next: '/conta/excluida' })
  res.cookies.delete(SESSION_COOKIE)
  return res
}
