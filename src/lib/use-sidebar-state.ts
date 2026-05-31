'use client'

import { useEffect, useState } from 'react'

const KEY = 'pp:sidebar-collapsed'

export function useSidebarState() {
  const [collapsed, setCollapsed] = useState<boolean>(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      const v = localStorage.getItem(KEY)
      if (v === '1') setCollapsed(true)
    } catch {}
  }, [])

  const toggle = () => {
    setCollapsed((v) => {
      const next = !v
      try {
        localStorage.setItem(KEY, next ? '1' : '0')
      } catch {}
      return next
    })
  }

  return { collapsed, toggle, mounted }
}
