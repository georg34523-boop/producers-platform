'use client'

import { useTransition } from 'react'

import { ROLE_LABEL } from '@/lib/labels'
import type { UserRole } from '@/lib/supabase/types'

import { changeRole } from './actions'

const ROLES: UserRole[] = ['coo', 'ceo', 'producer']

export function RoleSelect({ userId, role }: { userId: string; role: UserRole }) {
  const [pending, startTransition] = useTransition()
  return (
    <select
      defaultValue={role}
      disabled={pending}
      onChange={(e) => {
        const fd = new FormData()
        fd.append('user_id', userId)
        fd.append('role', e.target.value)
        startTransition(() => {
          void changeRole(fd)
        })
      }}
      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABEL[r]}
        </option>
      ))}
    </select>
  )
}
