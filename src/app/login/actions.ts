'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'

const SignInSchema = z.object({
  email: z.email({ error: 'Введите корректный email' }).trim().toLowerCase(),
  password: z.string().min(1, { error: 'Введите пароль' }),
  next: z.string().optional(),
})

export type AuthFormState = { error?: string } | undefined

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = SignInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') || undefined,
  })

  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { error: first?.message ?? 'Ошибка валидации' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    return { error: 'Неверный email или пароль' }
  }

  revalidatePath('/', 'layout')
  redirect(parsed.data.next?.startsWith('/') ? parsed.data.next : '/')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
