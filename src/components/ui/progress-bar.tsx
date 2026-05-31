'use client'

import { motion, useInView, useReducedMotion } from 'motion/react'
import { useRef } from 'react'

import { cn } from '@/lib/utils'
import { easeOut } from '@/lib/motion'

export function ProgressBar({
  pct,
  size = 'md',
  className,
}: {
  pct: number
  size?: 'sm' | 'md'
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10% 0px' })
  const reduced = useReducedMotion()
  const clamped = Math.max(0, Math.min(100, pct))
  const color =
    clamped >= 100
      ? 'bg-emerald-500'
      : clamped >= 50
      ? 'bg-primary'
      : 'bg-muted-foreground/40'
  const h = size === 'sm' ? 'h-1' : 'h-2'

  return (
    <div ref={ref} className={cn('overflow-hidden rounded-full bg-muted', h, className)}>
      <motion.div
        initial={{ width: reduced ? `${clamped}%` : 0 }}
        animate={{ width: inView || reduced ? `${clamped}%` : 0 }}
        transition={{ duration: 0.7, ease: easeOut }}
        className={cn('h-full rounded-full', color)}
      />
    </div>
  )
}
