import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { Profile, Project } from '@/lib/supabase/types'

export type ProjectWithProducer = Project & {
  producer: Pick<Profile, 'id' | 'full_name' | 'email'> | null
}

export async function listProjects(): Promise<ProjectWithProducer[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('projects')
    .select(`*, producer:profiles!projects_producer_id_fkey(id, full_name, email)`)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ProjectWithProducer[]
}

export async function getProject(id: string): Promise<ProjectWithProducer | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('projects')
    .select(`*, producer:profiles!projects_producer_id_fkey(id, full_name, email)`)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as unknown as ProjectWithProducer | null
}
