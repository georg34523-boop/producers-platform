'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const InviteSchema = z.object({
  email: z.email({ error: 'Введи корректный email' }).trim().toLowerCase(),
  full_name: z.string().min(2, { error: 'Минимум 2 символа' }).trim(),
  role: z.enum(['team_lead', 'producer', 'expert', 'member']),
  password: z.string().min(8, { error: 'Минимум 8 символов' }),
})

export type TeamFormState =
  | { error?: string; fieldErrors?: Record<string, string[] | undefined>; ok?: string }
  | undefined

export async function inviteUser(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const me = await requireProfile()
  if (me.role !== 'team_lead') return { error: 'Только тим-лид' }

  const parsed = InviteSchema.safeParse({
    email: formData.get('email'),
    full_name: formData.get('full_name'),
    role: formData.get('role'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors }

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
    return { error: createErr?.message ?? 'Не удалось создать пользователя' }
  }

  const { error: profileErr } = await admin
    .from('profiles')
    .update({ role: parsed.data.role, full_name: parsed.data.full_name })
    .eq('id', created.user.id)
  if (profileErr) return { error: profileErr.message }

  revalidatePath('/team')
  return { ok: `Создан: ${parsed.data.full_name} (${parsed.data.email})` }
}

const RoleChangeSchema = z.object({
  user_id: z.uuid(),
  role: z.enum(['team_lead', 'producer', 'expert', 'member']),
})

export async function changeRole(formData: FormData): Promise<void> {
  const me = await requireProfile()
  if (me.role !== 'team_lead') return

  const parsed = RoleChangeSchema.safeParse({
    user_id: formData.get('user_id'),
    role: formData.get('role'),
  })
  if (!parsed.success) return

  const supabase = await createClient()
  await supabase.from('profiles').update({ role: parsed.data.role }).eq('id', parsed.data.user_id)
  revalidatePath('/team')
}
