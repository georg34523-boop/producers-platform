import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { HelpRequest, Profile, Project } from '@/lib/supabase/types'

export type HelpRow = HelpRequest & {
  project: Pick<Project, 'id' | 'name'>
  requester: Pick<Profile, 'id' | 'full_name' | 'email'>
}

export async function listHelpRequests(): Promise<HelpRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('help_requests')
    .select(
      `*,
       project:projects!help_requests_project_id_fkey(id, name),
       requester:profiles!help_requests_requester_id_fkey(id, full_name, email)`,
    )
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as HelpRow[]
}
