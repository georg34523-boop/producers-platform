import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { ProjectExpense, ProjectReturn } from '@/lib/supabase/types'

export async function listExpenses(projectId: string): Promise<ProjectExpense[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('project_expenses')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  return (data ?? []) as ProjectExpense[]
}

export async function listReturns(projectId: string): Promise<ProjectReturn[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('project_returns')
    .select('*')
    .eq('project_id', projectId)
    .order('day_date', { ascending: false })
  return (data ?? []) as ProjectReturn[]
}
