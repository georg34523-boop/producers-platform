'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ROLE_LABEL } from '@/lib/labels'
import type { UserRole } from '@/lib/supabase/types'

import { inviteUser, type TeamFormState } from './actions'

const ROLES: UserRole[] = ['producer', 'team_lead']

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs ' +
  'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none'

export function InviteForm() {
  const [state, action, pending] = useActionState<TeamFormState, FormData>(inviteUser, undefined)
  const err = (k: string) => state?.fieldErrors?.[k]?.[0]

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="full_name">Имя</Label>
        <Input id="full_name" name="full_name" required />
        {err('full_name') ? <p className="text-xs text-destructive">{err('full_name')}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
        {err('email') ? <p className="text-xs text-destructive">{err('email')}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="role">Роль</Label>
        <select id="role" name="role" defaultValue="producer" className={selectClass}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Временный пароль</Label>
        <Input id="password" name="password" type="text" minLength={8} required defaultValue="" />
        <p className="text-xs text-muted-foreground">Пользователь сменит при первом входе (потом добавим).</p>
        {err('password') ? <p className="text-xs text-destructive">{err('password')}</p> : null}
      </div>

      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{state.ok}</p> : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Создаём…' : 'Создать пользователя'}
      </Button>
    </form>
  )
}
