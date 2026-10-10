import { redirect } from 'next/navigation'
import { FarmGame } from '@/components/FarmGame'
import { currentUser } from '@/server/session'

export const dynamic = 'force-dynamic'

export default async function VisitFarm({ params }: { params: Promise<{ handle: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/')
  const { handle } = await params
  if (handle === user.handle) redirect('/fazenda')
  return <FarmGame key={handle} owner={handle} />
}
