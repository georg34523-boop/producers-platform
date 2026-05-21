import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/supabase/types'

export type ProjectProgress = {
  id: string
  name: string
  status: string
  producer_name: string | null
  metrics: {
    name: string
    unit: string | null
    target_value: number
    actual_value: number
    progress: number
  }[]
  overall_progress: number | null
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function monthStartIso(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export async function getProjectsProgress(): Promise<ProjectProgress[]> {
  const supabase = await createClient()
  const month = monthStartIso()

  const { data: projects, error } = await supabase
    .from('projects')
    .select(
      `id, name, status,
       producer:profiles!projects_producer_id_fkey(id, full_name, email),
       goals!goals_project_id_fkey(
         id, period_type, period_start,
         metrics:goal_metrics(name, unit, target_value, actual_value)
       )`,
    )
    .eq('status', 'active')

  if (error) throw new Error(error.message)

  type ProjectRow = {
    id: string
    name: string
    status: string
    producer: Pick<Profile, 'id' | 'full_name' | 'email'> | null
    goals:
      | Array<{
          id: string
          period_type: 'month' | 'week'
          period_start: string
          metrics: Array<{ name: string; unit: string | null; target_value: number; actual_value: number }>
        }>
      | null
  }

  return ((projects ?? []) as unknown as ProjectRow[]).map((p) => {
    const currentMonth = p.goals?.filter(
      (g) => g.period_type === 'month' && g.period_start === month,
    )
    const metrics =
      currentMonth?.flatMap((g) =>
        g.metrics.map((m) => ({
          name: m.name,
          unit: m.unit,
          target_value: m.target_value,
          actual_value: m.actual_value,
          progress:
            m.target_value > 0
              ? Math.min(100, Math.round((m.actual_value / m.target_value) * 100))
              : 0,
        })),
      ) ?? []
    const overall =
      metrics.length > 0
        ? Math.round(metrics.reduce((s, m) => s + m.progress, 0) / metrics.length)
        : null

    return {
      id: p.id,
      name: p.name,
      status: p.status,
      producer_name: p.producer?.full_name ?? p.producer?.email ?? null,
      metrics,
      overall_progress: overall,
    }
  })
}

export type TodayTask = {
  id: string
  project_id: string
  project_name: string
  title: string
  status: string
  assignee_name: string | null
  due_date: string | null
}

export async function getTodayTasks(forUserId: string): Promise<TodayTask[]> {
  const supabase = await createClient()
  const today = todayIso()
  const { data, error } = await supabase
    .from('tasks')
    .select(
      `id, project_id, title, status, due_date,
       project:projects!tasks_project_id_fkey(name),
       assignee:profiles!tasks_assignee_id_fkey(full_name, email)`,
    )
    .neq('status', 'done')
    .or(`assignee_id.eq.${forUserId},due_date.lte.${today}`)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(20)

  if (error) throw new Error(error.message)
  type Row = {
    id: string
    project_id: string
    title: string
    status: string
    due_date: string | null
    project: { name: string } | null
    assignee: { full_name: string | null; email: string } | null
  }
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    project_id: r.project_id,
    project_name: r.project?.name ?? '—',
    title: r.title,
    status: r.status,
    assignee_name: r.assignee?.full_name ?? r.assignee?.email ?? null,
    due_date: r.due_date,
  }))
}

export type OpenHelp = {
  id: string
  project_id: string
  project_name: string
  title: string
  requester_name: string
  created_at: string
}

export async function getOpenHelpRequests(): Promise<OpenHelp[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('help_requests')
    .select(
      `id, project_id, title, created_at,
       project:projects!help_requests_project_id_fkey(name),
       requester:profiles!help_requests_requester_id_fkey(full_name, email)`,
    )
    .neq('status', 'resolved')
    .order('created_at', { ascending: false })
    .limit(8)

  if (error) throw new Error(error.message)
  type Row = {
    id: string
    project_id: string
    title: string
    created_at: string
    project: { name: string } | null
    requester: { full_name: string | null; email: string } | null
  }
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    project_id: r.project_id,
    project_name: r.project?.name ?? '—',
    title: r.title,
    requester_name: r.requester?.full_name ?? r.requester?.email ?? '—',
    created_at: r.created_at,
  }))
}
