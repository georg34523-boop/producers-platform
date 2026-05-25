// Ручные TS-типы по схеме миграции 0005_reset_to_tz.sql.
// Сгенерируем через supabase gen types typescript, когда будут CLI/keys.

export type UserRole = 'coo' | 'ceo' | 'producer'
export type ProjectStatus = 'active' | 'paused' | 'archived'
export type WorkModel = 'fix_pct' | 'rev_70_30' | 'profit_50_50'
export type ProductStatus = 'active' | 'archived'
export type TrackerStatus = 'open' | 'closed'
export type LaunchStatus = 'on_time' | 'partial' | 'failed'
export type ExpenseKind = 'service' | 'fot' | 'contractor' | 'other'
export type ExpenseRecurrence = 'monthly' | 'one_off'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  expert_name: string
  expert_contacts: string | null
  producer_id: string | null
  status: ProjectStatus
  work_model: WorkModel
  fix_amount: number | null
  model_started_at: string
  created_at: string
  created_by: string | null
}

export interface ProjectModelHistory {
  id: string
  project_id: string
  changed_at: string
  changed_by: string | null
  from_model: WorkModel | null
  to_model: WorkModel
  effective_from: string
}

export interface Product {
  id: string
  project_id: string
  name: string
  description: string | null
  current_price: number
  status: ProductStatus
  position: number
  created_at: string
  created_by: string | null
}

export interface ProductPriceHistory {
  id: string
  product_id: string
  old_price: number | null
  new_price: number
  changed_at: string
  changed_by: string | null
}

export interface MonthlyTracker {
  id: string
  project_id: string
  year: number
  month: number
  status: TrackerStatus
  revenue_plan_min: number
  revenue_plan_avg: number
  revenue_plan_max: number
  sales_plan: number
  applications_plan: number
  avg_check_plan: number
  traffic_enabled: boolean
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

export interface TrackerWeeklyPlan {
  id: string
  tracker_id: string
  week_index: number
  revenue_plan: number
}

export interface TrackerCustomDriver {
  id: string
  tracker_id: string
  name: string
  unit: string | null
  plan_value: number
  actual_value: number
  position: number
}

export interface Funnel {
  id: string
  tracker_id: string
  name: string
  funnel_type: string | null
  is_mini_product: boolean
  product_id: string | null
  traffic_enabled: boolean
  traffic_channel: string | null
  traffic_channels: string[]
  position: number
  created_at: string
}

export interface FunnelMiniPrice {
  id: string
  funnel_id: string
  name: string
  price: number
  position: number
  created_at: string
}

export type MetricRole = 'revenue' | 'sales' | 'applications' | 'traffic_spend' | 'other'

export interface FunnelMetric {
  id: string
  funnel_id: string
  key: string
  label: string
  role: MetricRole
  unit: string | null
  plan_value: number
  position: number
  stage_group: string | null
  computed_from: string[] | null
  created_at: string
}

export interface FunnelDailyLog {
  id: string
  funnel_id: string
  day_date: string
  values: Record<string, number>
  comment: string | null
  created_at: string
  updated_at: string
}

export interface ProjectExpense {
  id: string
  project_id: string
  name: string
  kind: ExpenseKind
  recurrence: ExpenseRecurrence
  amount: number
  start_date: string
  end_date: string | null
  one_off_date: string | null
  created_at: string
  created_by: string | null
}

export interface ProjectReturn {
  id: string
  project_id: string
  product_id: string | null
  day_date: string
  amount: number
  reason: string | null
  created_at: string
  created_by: string | null
}
