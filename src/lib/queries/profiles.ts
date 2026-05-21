import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { Profile, UserRole } from '@/lib/supabase/types'

export async function listProfiles(opts?: { roles?: UserRole[] }): Promise<Profile[]> {
  const supabase = await createClient()
  let q = supabase.from('profiles').select('*').order('full_name', { ascending: true })
  if (opts?.roles && opts.roles.length > 0) {
    q = q.in('role', opts.roles)
  }
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as Profile[]
}
