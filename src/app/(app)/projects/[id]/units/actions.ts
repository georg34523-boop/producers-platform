'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

const revalidate = (projectId: string) => {
  revalidatePath(`/projects/${projectId}/units`)
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/')
}

const ExpenseSchema = z.object({
  project_id: z.uuid(),
  name: z.string().min(1).max(200).trim(),
  kind: z.enum(['service', 'fot', 'contractor', 'other']),
  recurrence: z.enum(['monthly', 'one_off']),
  amount: z.coerce.number().min(0),
  start_date: z.iso.date().optional(),
  end_date: z.union([z.iso.date(), z.literal('')]).optional(),
  one_off_date: z.union([z.iso.date(), z.literal('')]).optional(),
})

export type ExpenseActionState = { error?: string } | undefined

export async function addExpense(
  _prev: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  await requireProfile()
  const parsed = ExpenseSchema.safeParse({
    project_id: formData.get('project_id'),
    name: formData.get('name'),
    kind: formData.get('kind'),
    recurrence: formData.get('recurrence'),
    amount: formData.get('amount'),
    start_date: formData.get('start_date') || undefined,
    end_date: formData.get('end_date') || undefined,
    one_off_date: formData.get('one_off_date') || undefined,
  })
  if (!parsed.success) return { error: 'Проверь поля' }

  const supabase = await createClient()
  await supabase.from('project_expenses').insert({
    project_id: parsed.data.project_id,
    name: parsed.data.name,
    kind: parsed.data.kind,
    recurrence: parsed.data.recurrence,
    amount: parsed.data.amount,
    start_date: parsed.data.start_date ?? new Date().toISOString().slice(0, 10),
    end_date: parsed.data.end_date || null,
    one_off_date: parsed.data.one_off_date || null,
  })
  revalidate(parsed.data.project_id)
  return undefined
}

export async function deleteExpense(expenseId: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('project_expenses').delete().eq('id', expenseId)
  revalidate(projectId)
}

const ReturnSchema = z.object({
  project_id: z.uuid(),
  product_id: z.union([z.uuid(), z.literal('')]).transform((v) => (v === '' ? null : v)),
  day_date: z.iso.date(),
  amount: z.coerce.number().min(0),
  reason: z.string().max(500).trim().optional().or(z.literal('')),
})

export async function addReturn(
  _prev: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  await requireProfile()
  const parsed = ReturnSchema.safeParse({
    project_id: formData.get('project_id'),
    product_id: formData.get('product_id') ?? '',
    day_date: formData.get('day_date'),
    amount: formData.get('amount'),
    reason: formData.get('reason') ?? '',
  })
  if (!parsed.success) return { error: 'Проверь поля' }

  const supabase = await createClient()
  await supabase.from('project_returns').insert({
    project_id: parsed.data.project_id,
    product_id: parsed.data.product_id,
    day_date: parsed.data.day_date,
    amount: parsed.data.amount,
    reason: parsed.data.reason || null,
  })
  revalidate(parsed.data.project_id)
  return undefined
}

export async function deleteReturn(returnId: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('project_returns').delete().eq('id', returnId)
  revalidate(projectId)
}
