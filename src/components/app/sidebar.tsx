'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Folders, LayoutDashboard, LifeBuoy, Target, Users } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { UserRole } from '@/lib/supabase/types'

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  roles: UserRole[]
}

const NAV: NavItem[] = [
  { href: '/', label: 'Дашборд', icon: LayoutDashboard, roles: ['team_lead', 'producer', 'expert', 'member'] },
  { href: '/projects', label: 'Проекты', icon: Folders, roles: ['team_lead', 'producer', 'expert', 'member'] },
  { href: '/goals', label: 'Цели', icon: Target, roles: ['team_lead', 'producer', 'expert', 'member'] },
  { href: '/help', label: 'Запросы помощи', icon: LifeBuoy, roles: ['team_lead', 'producer'] },
  { href: '/team', label: 'Команда', icon: Users, roles: ['team_lead'] },
]

export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname()
  const items = NAV.filter((i) => i.roles.includes(role))

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-sidebar text-sidebar-foreground md:block">
      <div className="flex h-14 items-center border-b px-5">
        <span className="text-sm font-semibold tracking-tight">Producers Platform</span>
      </div>
      <nav className="p-3">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const active = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href))
            const Icon = item.icon
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors',
                    active
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
