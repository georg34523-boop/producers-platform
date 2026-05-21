'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

const CreateSchema = z.object({
  project_id: z.uuid(),
  title: z.string().min(2).max(200).trim(),
  body: z.string().max(5000).trim().optional().or(z.literal('')),
})

export type HelpActionState = { error?: string } | undefined

export async function createHelpRequest(
  _prev: HelpActionState,
  formData: FormData,
): Promise<HelpActionState> {
  const me = await requireProfile()
  const parsed = CreateSchema.safeParse({
    project_id: formData.get('project_id'),
    title: formData.get('title'),
    body: formData.get('body') ?? '',
  })
  if (!parsed.success) return { error: 'Заполни проект и название запроса' }
  const supabase = await createClient()
  const { error } = await supabase.from('help_requests').insert({
    project_id: parsed.data.project_id,
    title: parsed.data.title,
    body: parsed.data.body || null,
    requester_id: me.id,
  })
  if (error) return { error: error.message }
  revalidatePath('/help')
  revalidatePath('/')
  return undefined
}

export async function setHelpStatus(
  id: string,
  status: 'open' | 'in_progress' | 'resolved',
): Promise<void> {
  const me = await requireProfile()
  const patch: Record<string, unknown> = { status }
  if (status === 'resolved') {
    patch.resolved_at = new Date().toISOString()
    patch.resolved_by = me.id
  } else {
    patch.resolved_at = null
    patch.resolved_by = null
  }
  const supabase = await createClient()
  await supabase.from('help_requests').update(patch).eq('id', id)
  revalidatePath('/help')
  revalidatePath('/')
}

export async function deleteHelpRequest(id: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('help_requests').delete().eq('id', id)
  revalidatePath('/help')
  revalidatePath('/')
}
