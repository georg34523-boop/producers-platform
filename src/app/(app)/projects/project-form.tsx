'use client'

import { useActionState, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { WORK_MODEL_LABEL } from '@/lib/labels'
import type { Profile, WorkModel } from '@/lib/supabase/types'

import { createProject, type ProjectFormState } from './actions'

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs ' +
  'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none'

const MODELS: WorkModel[] = ['rev_70_30', 'fix_pct', 'profit_50_50']

export function ProjectForm({ producers }: { producers: Profile[] }) {
  const [state, action, pending] = useActionState<ProjectFormState, FormData>(
    createProject,
    undefined,
  )
  const [model, setModel] = useState<WorkModel>('rev_70_30')
  const err = (k: string) => state?.fieldErrors?.[k]?.[0]

  return (
    <form action={action} className="space-y-4 rounded-lg border bg-card p-6 shadow-sm">
      <div className="space-y-2">
        <Label htmlFor="expert_name">Имя эксперта</Label>
        <Input id="expert_name" name="expert_name" required placeholder="Например: Маша Иванова" />
        {err('expert_name') ? <p className="text-xs text-destructive">{err('expert_name')}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="expert_contacts">Контакты эксперта</Label>
        <Textarea
          id="expert_contacts"
          name="expert_contacts"
          rows={2}
          placeholder="@username в Telegram, email, телефон…"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="producer_id">Продюсер</Label>
        <select id="producer_id" name="producer_id" defaultValue="" className={selectClass}>
          <option value="">— не назначен —</option>
          {producers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name ?? p.email}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="work_model">Модель работы</Label>
          <select
            id="work_model"
            name="work_model"
            value={model}
            onChange={(e) => setModel(e.target.value as WorkModel)}
            className={selectClass}
          >
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {WORK_MODEL_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
        {model === 'fix_pct' ? (
          <div className="space-y-2">
            <Label htmlFor="fix_amount">Фикс, $/мес</Label>
            <Input id="fix_amount" name="fix_amount" type="number" min={0} step="any" defaultValue={0} />
          </div>
        ) : null}
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
