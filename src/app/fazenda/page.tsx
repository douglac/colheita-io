import { redirect } from 'next/navigation'
import { FarmGame } from '@/components/FarmGame'
import { currentUser } from '@/server/session'

export const dynamic = 'force-dynamic'

export default async function MyFarm() {
  if (!(await currentUser())) redirect('/')
  return <FarmGame />
}
