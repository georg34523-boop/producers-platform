import { Sidebar } from '@/components/app/sidebar'
import { Topbar } from '@/components/app/topbar'
import { requireProfile } from '@/lib/auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile()
  return (
    <div className="flex min-h-svh">
      <Sidebar role={profile.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar profile={profile} />
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
