import type { ProjectStatus, TaskStatus, UserRole } from '@/lib/supabase/types'

export const ROLE_LABEL: Record<UserRole, string> = {
  team_lead: 'Тим-лид',
  producer: 'Продюсер',
  expert: 'Эксперт',
  member: 'Участник',
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Активный',
  paused: 'Приостановлен',
  archived: 'В архиве',
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'К выполнению',
  in_progress: 'В работе',
  blocked: 'Заблокировано',
  done: 'Готово',
}
