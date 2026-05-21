import 'server-only'

import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/supabase/types'

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === '1'

const DEMO_PROFILE: Profile = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'demo@producers.local',
  full_name: 'Тим-лид (демо)',
  role: 'team_lead',
  telegram_chat_id: null,
  avatar_url: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

/**
 * Fetch the authenticated user's profile. Redirects to /login if unauthenticated.
 * Use this in any server component that requires auth — never trust the proxy
 * for authorization (it is for optimistic checks only).
 */
export async function requireProfile(): Promise<Profile> {
  if (DEMO_MODE) return DEMO_PROFILE

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error || !data) redirect('/login')
  return data as Profile
}

export async function getProfileOrNull(): Promise<Profile | null> {
  if (DEMO_MODE) return DEMO_PROFILE

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  return (data as Profile | null) ?? null
}
