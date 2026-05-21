'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

const UuidOrEmpty = z.union([z.uuid(), z.literal('')]).transform((v) => (v === '' ? null : v))

const ProjectSchema = z.object({
  name: z.string().min(2, { error: 'Минимум 2 символа' }).max(120).trim(),
  description: z.string().max(2000).trim().optional().or(z.literal('')),
  producer_id: UuidOrEmpty,
  expert_name: z.string().max(120).trim().optional().or(z.literal('')),
  status: z.enum(['active', 'paused', 'archived']).default('active'),
})

export type ProjectFormState =
  | { error?: string; fieldErrors?: Record<string, string[] | undefined> }
  | undefined

export async function createProject(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const me = await requireProfile()
  if (me.role !== 'team_lead') {
    return { error: 'Только тим-лид может создавать проекты' }
  }

  const parsed = ProjectSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') ?? '',
    producer_id: formData.get('producer_id') ?? '',
    expert_name: formData.get('expert_name') ?? '',
    status: formData.get('status') ?? 'active',
  })
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('projects')
    .insert({
      name: parsed.data.name,
      description: parsed.data.description || null,
      producer_id: parsed.data.producer_id,
      expert_name: parsed.data.expert_name || null,
      status: parsed.data.status,
      created_by: me.id,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/projects')
  redirect(`/projects/${data.id}`)
}

const UpdateSchema = ProjectSchema.partial().extend({ id: z.uuid() })

export async function updateProject(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const parsed = UpdateSchema.safeParse({
    id: formData.get('id'),
    name: formData.get('name') ?? undefined,
    description: formData.get('description') ?? undefined,
    producer_id: formData.get('producer_id') ?? undefined,
    expert_name: formData.get('expert_name') ?? undefined,
    status: formData.get('status') ?? undefined,
  })
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  const { id, ...patch } = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.from('projects').update(patch).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/projects')
  revalidatePath(`/projects/${id}`)
  return undefined
}
