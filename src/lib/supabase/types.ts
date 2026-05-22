// Hand-rolled types for now; will be regenerated via `supabase gen types typescript` once the
// Supabase project is provisioned and credentials are added to .env.local.

export type UserRole = 'team_lead' | 'producer' | 'expert' | 'member'
export type ProjectStatus = 'active' | 'paused' | 'archived' | 'candidate'

export type TrackerStatus = 'open' | 'closed'
export type LaunchStatus = 'on_time' | 'partial' | 'failed'
export type TrackerLogKind = 'revenue' | 'traffic_spend' | 'leads'
export type TaskKind =
  | 'launch'
  | 'content'
  | 'communication'
  | 'tech_request'
  | 'target_request'
  | 'analytics'
  | 'other'

export interface MonthlyTracker {
  id: string
  project_id: string
  year: number
  month: number
  status: TrackerStatus
  revenue_plan: number
  traffic_enabled: boolean
  traffic_spend_plan: number
  nps: number | null
  launch_status: LaunchStatus | null
  expert_mood: string | null
  summary_main: string | null
  summary_worked: string | null
  summary_not_worked: string | null
  summary_changes: string | null
  created_at: string
  created_by: string | null
  closed_at: string | null
  closed_by: string | null
}

export interface TrackerDailyLog {
  id: string
  tracker_id: string
  day_date: string
  kind: TrackerLogKind
  amount: number
}

export interface TrackerFunnel {
  id: string
  tracker_id: string
  name: string
  position: number
  created_at: string
}

export interface TrackerFunnelStage {
  id: string
  funnel_id: string
  name: string
  unit: string
  plan_value: number
  position: number
  created_at: string
}

export interface TrackerFunnelStageLog {
  id: string
  stage_id: string
  day_date: string
  amount: number
}

export interface YearlySummary {
  id: string
  project_id: string
  year: number
  month: number
  revenue_plan: number | null
  revenue_actual: number | null
  best_funnel_name: string | null
  best_funnel_conversion: number | null
  worst_funnel_name: string | null
  worst_funnel_conversion: number | null
  traffic_spend: number | null
  roas: number | null
  nps: number | null
  launch_status: LaunchStatus | null
  insight: string | null
  flag: 'green' | 'yellow' | 'red' | null
  transferred_at: string
  transferred_by: string | null
}

export interface PlannerSection {
  id: string
  project_id: string
  name: string
  position: number
  created_at: string
}
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
  expert_name: string | null
  producer_id: string | null
  status: ProjectStatus
  created_at: string
  created_by: string | null
  archived_at: string | null
}

export interface TaskChecklistItem {
  id: string
  task_id: string
  title: string
  done: boolean
  position: number
  created_at: string
}

export interface Comment {
  id: string
  entity_type: CommentEntity
  entity_id: string
  author_id: string
  body: string
  created_at: string
}

export interface HelpRequest {
  id: string
  project_id: string
  requester_id: string
  task_id: string | null
  title: string
  body: string | null
  status: HelpStatus
  created_at: string
  resolved_at: string | null
  resolved_by: string | null
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

export interface Funnel {
  id: string
  project_id: string
  name: string
  description: string | null
  period_start: string
  period_end: string
  created_at: string
  created_by: string | null
}

export interface FunnelStage {
  id: string
  funnel_id: string
  name: string
  unit: string | null
  target_value: number
  actual_value: number
  position: number
  created_at: string
}

export interface FunnelStageWeek {
  id: string
  stage_id: string
  week_start: string
  week_end: string
  target: number
  actual: number
  position: number
}
