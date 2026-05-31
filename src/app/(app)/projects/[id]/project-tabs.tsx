'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

const TABS = [
  { suffix: '', label: 'Обзор' },
  { suffix: '/products', label: 'Продукты' },
  { suffix: '/tracker', label: 'Трекер месяца' },
  { suffix: '/tasks', label: 'Задачі' },
  { suffix: '/units', label: 'Юниты' },
] as const

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname()
  const base = `/projects/${projectId}`
  return (
    <div className="border-b">
      <nav className="-mb-px flex gap-1">
        {TABS.map((t) => {
          const href = `${base}${t.suffix}`
          const active = pathname === href
          return (
            <Link
              key={t.suffix}
              href={href}
              className={cn(
                'border-b-2 px-3 py-2 text-sm transition-colors',
                active
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
