'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Folders, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Users } from 'lucide-react'
import { motion } from 'motion/react'

import { cn } from '@/lib/utils'
import { useSidebarState } from '@/lib/use-sidebar-state'
import type { UserRole } from '@/lib/supabase/types'

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  roles: UserRole[]
}

const NAV: NavItem[] = [
  { href: '/', label: 'Дашборд', icon: LayoutDashboard, roles: ['coo', 'ceo', 'producer'] },
  { href: '/projects', label: 'Проекты', icon: Folders, roles: ['coo', 'ceo', 'producer'] },
  { href: '/team', label: 'Команда', icon: Users, roles: ['coo', 'ceo'] },
]

const W_OPEN = 224
const W_CLOSED = 60

export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname()
  const items = NAV.filter((i) => i.roles.includes(role))
  const { collapsed, toggle, mounted } = useSidebarState()
  const width = mounted && collapsed ? W_CLOSED : W_OPEN

  return (
    <motion.aside
      animate={{ width }}
      initial={false}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="hidden shrink-0 border-r bg-sidebar text-sidebar-foreground md:flex md:flex-col"
      style={{ width: mounted ? undefined : W_OPEN }}
    >
      <div className="flex h-12 items-center border-b px-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <span className="text-[11px] font-semibold tracking-tight">PP</span>
        </div>
        <span
          className={cn(
            'ml-2 truncate text-sm font-medium tracking-tight transition-opacity duration-150',
            collapsed && 'pointer-events-none opacity-0',
          )}
        >
          Producers Platform
        </span>
      </div>

      <nav className="flex-1 p-2">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const active = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href))
            const Icon = item.icon
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors',
                    active
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId="sidebar-active"
                      className="absolute -left-2 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full bg-primary"
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    />
                  ) : null}
                  <Icon className="h-[1.05rem] w-[1.05rem] shrink-0" />
                  <span
                    className={cn(
                      'truncate transition-opacity duration-150',
                      collapsed && 'pointer-events-none opacity-0',
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="border-t p-2">
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Розгорнути сайдбар' : 'Згорнути сайдбар'}
          className={cn(
            'flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-[1.05rem] w-[1.05rem]" />
          ) : (
            <PanelLeftClose className="h-[1.05rem] w-[1.05rem]" />
          )}
          <span
            className={cn(
              'truncate transition-opacity duration-150',
              collapsed && 'pointer-events-none opacity-0',
            )}
          >
            Згорнути
          </span>
        </button>
      </div>
    </motion.aside>
  )
}
