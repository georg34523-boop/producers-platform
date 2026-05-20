'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { signIn, type AuthFormState } from './actions'

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signIn, undefined)

  return (
    <form action={action} className="space-y-4 rounded-lg border bg-card p-6 shadow-sm">
      <input type="hidden" name="next" value={nextPath} />
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Пароль</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state?.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Входим…' : 'Войти'}
      </Button>
    </form>
  )
}
