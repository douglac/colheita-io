import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AccountPanel } from '@/components/AuthForms'
import { avatarOf } from '@/game/avatar'
import { GAME_NAME } from '@/game/config'
import { getDb } from '@/server/db'
import { testLoginEnabled } from '@/server/flags'
import { currentUser } from '@/server/session'

export const dynamic = 'force-dynamic'
export const metadata = { title: `Minha conta · ${GAME_NAME}`, robots: { index: false } }

export default async function Conta({ searchParams }: { searchParams: Promise<{ ligado?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/')
  const db = await getDb()
  const { rows: [row] } = await db.query<{ email: string | null; avatar: string | null; sessions: number; public_ranking: boolean; age_band: string | null }>(
    'select email, avatar, public_ranking, age_band, (select count(*)::int from sessions s where s.user_id = u.id and s.expires_at > now()) as sessions from users u where id = $1', [user.id])
  const linked = (await searchParams).ligado === '1'
  return (
    <main className="login account-page">
      <h1>Minha conta</h1>
      <p><b>{user.handle}</b></p>
      {linked && <p className="sent-note">✅ E-mail ligado! Agora você entra com ele em qualquer aparelho.</p>}
      <AccountPanel handle={user.handle} avatar={avatarOf(row.avatar, user.handle)} email={row.email} sessions={row.sessions} testLogin={testLoginEnabled()}
        publicRanking={row.public_ranking} minor={row.age_band != null && row.age_band !== '18p'} />
      <Link className="btn big" href="/fazenda">🌱 Voltar para a fazenda</Link>
    </main>
  )
}
