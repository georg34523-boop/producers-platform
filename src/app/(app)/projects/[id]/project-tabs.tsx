'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'motion/react'

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
                'relative px-3 py-2 text-sm transition-colors',
                active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
              {active ? (
                <motion.span
                  layoutId="project-tab-underline"
                  className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-primary"
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                />
              ) : null}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
