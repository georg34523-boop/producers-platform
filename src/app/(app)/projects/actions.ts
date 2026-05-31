'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { requireProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const UuidOrEmpty = z.union([z.uuid(), z.literal('')]).transform((v) => (v === '' ? null : v))

const CreateSchema = z.object({
  expert_name: z.string().min(2, { error: 'Имя эксперта обязательно' }).trim(),
  expert_contacts: z.string().max(500).trim().optional().or(z.literal('')),
  producer_id: UuidOrEmpty,
  work_model: z.enum(['fix_pct', 'rev_70_30', 'profit_50_50']).default('rev_70_30'),
  fix_amount: z.coerce.number().min(0).optional(),
})

export type ProjectFormState = { error?: string; fieldErrors?: Record<string, string[] | undefined> } | undefined

function isAdmin(role: string) {
  return role === 'coo' || role === 'ceo'
}

export async function createProject(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const me = await requireProfile()
  if (!isAdmin(me.role)) return { error: 'Только COO/CEO может создавать проекты' }

  const parsed = CreateSchema.safeParse({
    expert_name: formData.get('expert_name'),
    expert_contacts: formData.get('expert_contacts') ?? '',
    producer_id: formData.get('producer_id') ?? '',
    work_model: formData.get('work_model') ?? 'rev_70_30',
    fix_amount: formData.get('fix_amount') || 0,
  })
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('projects')
    .insert({
      expert_name: parsed.data.expert_name,
      expert_contacts: parsed.data.expert_contacts || null,
      producer_id: parsed.data.producer_id,
      work_model: parsed.data.work_model,
      fix_amount: parsed.data.work_model === 'fix_pct' ? (parsed.data.fix_amount ?? 0) : null,
      model_started_at: new Date().toISOString().slice(0, 10),
      created_by: me.id,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  // Сід дефолтних груп задач (мають збігатись з міграцією 0013)
  await supabase.from('project_task_groups').insert(
    [
      { project_id: data.id, name: 'Продукт', is_seed: true, position: 0 },
      { project_id: data.id, name: 'Воронки', is_seed: true, position: 1 },
      { project_id: data.id, name: 'Трафік', is_seed: true, position: 2 },
      { project_id: data.id, name: 'Комунікація', is_seed: true, position: 3 },
      { project_id: data.id, name: 'Аналітика', is_seed: true, position: 4 },
    ],
  )

  revalidatePath('/projects')
  revalidatePath('/')
  redirect(`/projects/${data.id}`)
}

const UpdateSchema = z.object({
  id: z.uuid(),
  expert_name: z.string().min(2).optional(),
  expert_contacts: z.string().optional(),
  producer_id: UuidOrEmpty.optional(),
  status: z.enum(['active', 'paused', 'archived']).optional(),
  work_model: z.enum(['fix_pct', 'rev_70_30', 'profit_50_50']).optional(),
  fix_amount: z.coerce.number().min(0).optional(),
})

export async function updateProject(formData: FormData): Promise<void> {
  const me = await requireProfile()
  const parsed = UpdateSchema.safeParse({
    id: formData.get('id'),
    expert_name: formData.get('expert_name') ?? undefined,
    expert_contacts: formData.get('expert_contacts') ?? undefined,
    producer_id: formData.get('producer_id') ?? undefined,
    status: formData.get('status') ?? undefined,
    work_model: formData.get('work_model') ?? undefined,
    fix_amount: formData.get('fix_amount') ?? undefined,
  })
  if (!parsed.success) return

  const { id, ...patch } = parsed.data
  // Только COO/CEO могут менять модель и ОП
  if (!isAdmin(me.role)) {
    delete patch.work_model
    delete patch.producer_id
    delete patch.status
    delete patch.fix_amount
  }

  const supabase = await createClient()

  if (patch.work_model) {
    // Логируем смену модели
    const { data: cur } = await supabase
      .from('projects')
      .select('work_model')
      .eq('id', id)
      .maybeSingle()
    if (cur && cur.work_model !== patch.work_model) {
      const nextMonth = new Date()
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1, 1)
      await supabase.from('project_model_history').insert({
        project_id: id,
        changed_by: me.id,
        from_model: cur.work_model,
        to_model: patch.work_model,
        effective_from: nextMonth.toISOString().slice(0, 10),
      })
    }
  }

  await supabase.from('projects').update(patch).eq('id', id)
  revalidatePath(`/projects/${id}`)
  revalidatePath('/projects')
  revalidatePath('/')
}

// ============================================================
// Видалення проєкту
// ============================================================
export async function deleteProject(projectId: string): Promise<void> {
  const me = await requireProfile()
  if (!isAdmin(me.role)) return
  const supabase = await createClient()
  await supabase.from('projects').delete().eq('id', projectId)
  revalidatePath('/projects')
  revalidatePath('/')
  redirect('/projects')
}

// ============================================================
// Зміна продюсера (з опційним створенням нового користувача)
// ============================================================
const ChangeProducerSchema = z.object({
  project_id: z.uuid(),
  producer_id: z.uuid(),
})

export async function changeProducer(input: {
  project_id: string
  producer_id: string
}): Promise<{ error?: string } | undefined> {
  const me = await requireProfile()
  if (!isAdmin(me.role)) return { error: 'Тільки COO/CEO може міняти продюсера' }
  const parsed = ChangeProducerSchema.safeParse(input)
  if (!parsed.success) return { error: 'Невірний формат' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('projects')
    .update({ producer_id: parsed.data.producer_id })
    .eq('id', parsed.data.project_id)
  if (error) return { error: error.message }

  revalidatePath(`/projects/${parsed.data.project_id}`)
  revalidatePath('/projects')
  revalidatePath('/')
}

const InviteProducerSchema = z.object({
  full_name: z.string().min(2).trim(),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8),
})

/** Створити нового продюсера + одразу призначити його на проєкт. */
export async function inviteProducerAndAssign(input: {
  project_id: string
  full_name: string
  email: string
  password: string
}): Promise<{ error?: string } | undefined> {
  const me = await requireProfile()
  if (!isAdmin(me.role)) return { error: 'Тільки COO/CEO' }
  const parsed = InviteProducerSchema.safeParse({
    full_name: input.full_name,
    email: input.email,
    password: input.password,
  })
  if (!parsed.success) return { error: 'Заповни всі поля (email, ім\'я, пароль ≥ 8)' }

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Admin client unavailable' }
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name },
  })
  if (createErr || !created.user) {
    return { error: createErr?.message ?? 'Не вдалося створити користувача' }
  }

  const { error: profileErr } = await admin
    .from('profiles')
    .update({ role: 'producer', full_name: parsed.data.full_name })
    .eq('id', created.user.id)
  if (profileErr) return { error: profileErr.message }

  const supabase = await createClient()
  const { error: assignErr } = await supabase
    .from('projects')
    .update({ producer_id: created.user.id })
    .eq('id', input.project_id)
  if (assignErr) return { error: assignErr.message }

  revalidatePath(`/projects/${input.project_id}`)
  revalidatePath('/projects')
  revalidatePath('/')
  revalidatePath('/team')
}
