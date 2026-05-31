import type { Transition, Variants } from 'motion/react'

export const easeOut: Transition['ease'] = [0.16, 1, 0.3, 1]

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease: easeOut } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.15 } },
}

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
}

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.18, ease: easeOut } },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.14 } },
}

export const listItem: Variants = {
  initial: { opacity: 0, height: 0, y: -4 },
  animate: { opacity: 1, height: 'auto', y: 0, transition: { duration: 0.22, ease: easeOut } },
  exit: { opacity: 0, height: 0, y: -4, transition: { duration: 0.18 } },
}

export const drawLine = {
  initial: { pathLength: 0, opacity: 0 },
  animate: {
    pathLength: 1,
    opacity: 1,
    transition: { pathLength: { duration: 0.9, ease: easeOut }, opacity: { duration: 0.15 } },
  },
}

export const staggerContainer: Variants = {
  animate: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } },
}

export const dotPop: Variants = {
  initial: { opacity: 0, scale: 0 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.2, ease: easeOut } },
}
