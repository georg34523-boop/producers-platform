'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Profile, ProjectStatus } from '@/lib/supabase/types'

import { createProject, type ProjectFormState } from './actions'

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'active', label: 'Активный' },
  { value: 'paused', label: 'Приостановлен' },
  { value: 'archived', label: 'В архиве' },
]

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs ' +
  'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none'

export function ProjectForm({ producers }: { producers: Profile[] }) {
  const [state, action, pending] = useActionState<ProjectFormState, FormData>(
    createProject,
    undefined,
  )

  const err = (k: string) => state?.fieldErrors?.[k]?.[0]

  return (
    <form action={action} className="space-y-4 rounded-lg border bg-card p-6 shadow-sm">
      <div className="space-y-2">
        <Label htmlFor="name">Название</Label>
        <Input id="name" name="name" required placeholder="Запуск курса «…»" />
        {err('name') ? <p className="text-xs text-destructive">{err('name')}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Описание</Label>
        <Textarea id="description" name="description" rows={3} placeholder="Кратко: формат, аудитория, ниша" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="producer_id">Продюсер</Label>
          <select id="producer_id" name="producer_id" className={selectClass} defaultValue="">
            <option value="">— не назначен —</option>
            {producers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name ?? p.email}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="expert_name">Эксперт</Label>
          <Input id="expert_name" name="expert_name" placeholder="Имя эксперта" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">Статус</Label>
        <select id="status" name="status" className={selectClass} defaultValue="active">
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Создаём…' : 'Создать проект'}
        </Button>
      </div>
    </form>
  )
}
