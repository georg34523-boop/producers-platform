// Hand-rolled types for now; will be regenerated via `supabase gen types typescript` once the
// Supabase project is provisioned and credentials are added to .env.local.

export type UserRole = 'team_lead' | 'producer' | 'expert' | 'member'
export type ProjectStatus = 'active' | 'paused' | 'archived'
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done'
export type TaskPriority = 'low' | 'normal' | 'high'
export type GoalPeriod = 'month' | 'week'
export type HelpStatus = 'open' | 'in_progress' | 'resolved'
export type CommentEntity = 'task' | 'goal' | 'project' | 'help_request'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  telegram_chat_id: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  name: string
  description: string | null
  expert_id: string | null
  producer_id: string | null
  status: ProjectStatus
  created_at: string
  created_by: string | null
  archived_at: string | null
}

export interface Goal {
  id: string
  project_id: string
  parent_goal_id: string | null
  period_type: GoalPeriod
  period_start: string
  period_end: string
  title: string
  notes: string | null
  created_at: string
  created_by: string | null
}

export interface GoalMetric {
  id: string
  goal_id: string
  name: string
  unit: string | null
  target_value: number
  actual_value: number
  sheet_url: string | null
  sheet_cell: string | null
  last_synced_at: string | null
  display_order: number
  created_at: string
}

export interface Task {
  id: string
  project_id: string
  parent_task_id: string | null
  goal_id: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assignee_id: string | null
  due_date: string | null
  recurring_rule: string | null
  position: number
  created_at: string
  created_by: string | null
  completed_at: string | null
}
