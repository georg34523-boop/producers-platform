import type {
  ExpenseKind,
  ExpenseRecurrence,
  LaunchStatus,
  ProjectStatus,
  UserRole,
  WorkModel,
} from '@/lib/supabase/types'

export const ROLE_LABEL: Record<UserRole, string> = {
  coo: 'COO',
  ceo: 'CEO',
  producer: 'Продюсер',
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Активный',
  paused: 'На паузе',
  archived: 'В архиве',
}

export const WORK_MODEL_LABEL: Record<WorkModel, string> = {
  fix_pct: 'Фикс + %',
  rev_70_30: '70 / 30 от выручки',
  profit_50_50: '50 / 50 от чистой прибыли',
}

export const LAUNCH_STATUS_LABEL: Record<LaunchStatus, string> = {
  on_time: 'В срок',
  partial: 'Частично',
  failed: 'Сорван',
}

export const EXPENSE_KIND_LABEL: Record<ExpenseKind, string> = {
  service: 'Сервис',
  fot: 'ФОТ',
  contractor: 'Подрядчик',
  other: 'Прочее',
}

export const EXPENSE_RECURRENCE_LABEL: Record<ExpenseRecurrence, string> = {
  monthly: 'Ежемесячный',
  one_off: 'Разовый',
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
