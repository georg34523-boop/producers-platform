'use client'

import { useEffect, useRef } from 'react'
import { animate, useInView, useMotionValue, useReducedMotion } from 'motion/react'

import { easeOut } from '@/lib/motion'

export function CountUp({
  value,
  duration = 0.9,
  format,
  className,
  prefix = '',
  suffix = '',
}: {
  value: number
  duration?: number
  format?: (n: number) => string
  className?: string
  prefix?: string
  suffix?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10% 0px' })
  const motion = useMotionValue(0)
  const reduced = useReducedMotion()
  const fmt = format ?? ((n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 0 }))

  useEffect(() => {
    if (!ref.current) return
    if (reduced) {
      ref.current.textContent = `${prefix}${fmt(value)}${suffix}`
      return
    }
    if (!inView) return
    const controls = animate(motion, value, {
      duration,
      ease: easeOut,
      onUpdate: (latest) => {
        if (ref.current) ref.current.textContent = `${prefix}${fmt(latest)}${suffix}`
      },
    })
    return () => controls.stop()
  }, [inView, value, duration, motion, fmt, reduced, prefix, suffix])

  return (
    <span ref={ref} className={className}>
      {`${prefix}${fmt(reduced ? value : 0)}${suffix}`}
    </span>
  )
}
