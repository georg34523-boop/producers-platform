import type { ProjectStatus, UserRole } from '@/lib/supabase/types'

export const ROLE_LABEL: Record<UserRole, string> = {
  team_lead: 'Тим-лид',
  producer: 'Продюсер',
  expert: 'Эксперт',
  member: 'Участник',
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Активный',
  paused: 'На паузе',
  archived: 'В архиве',
  candidate: 'Кандидат',
}

export const LAUNCH_STATUS_LABEL: Record<'on_time' | 'partial' | 'failed', string> = {
  on_time: 'В срок',
  partial: 'Частично',
  failed: 'Сорван',
}

export const TASK_KIND_LABEL: Record<
  'launch' | 'content' | 'communication' | 'tech_request' | 'target_request' | 'analytics' | 'other',
  string
> = {
  launch: 'Запуск',
  content: 'Контент',
  communication: 'Коммуникация',
  tech_request: 'Тех-запрос',
  target_request: 'Таргет-запрос',
  analytics: 'Аналитика',
  other: 'Прочее',
}

export const MONTH_LABEL_RU: Record<number, string> = {
  1: 'Январь',
  2: 'Февраль',
  3: 'Март',
  4: 'Апрель',
  5: 'Май',
  6: 'Июнь',
  7: 'Июль',
  8: 'Август',
  9: 'Сентябрь',
  10: 'Октябрь',
  11: 'Ноябрь',
  12: 'Декабрь',
}

export const TASK_STATUS_LABEL: Record<string, string> = {
  todo: 'Не начато',
  in_progress: 'В работе',
  blocked: 'Заблокировано',
  waiting_tech: 'Ждёт тех',
  waiting_target: 'Ждёт таргет',
  waiting_expert: 'Ждёт эксперта',
  done: 'Готово',
}
