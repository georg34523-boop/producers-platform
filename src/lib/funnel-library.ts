// Библиотека шаблонов воронок и этапов согласно «Приложение к ТЗ — Конструктор воронок v2».
// Используется в UI трекера (создание воронки + добавление этапов из библиотеки)
// и при автоматическом расчёте юнитов.

import type { MetricRole } from '@/lib/supabase/types'

// ---------- Типы воронок (8 штук) ----------
export type FunnelType =
  | 'webinar'
  | 'autowebinar'
  | 'vsl'
  | 'tripwire'
  | 'subscription'
  | 'lead_magnet'
  | 'telegram_channel'
  | 'direct_landing'

export const FUNNEL_TYPE_LABEL: Record<FunnelType, string> = {
  webinar: 'Вебінарна',
  autowebinar: 'Автовебінарна',
  vsl: 'VSL',
  tripwire: 'Трипвайр / мини-продукт',
  subscription: 'На підписку',
  lead_magnet: 'Лід-магнітна',
  telegram_channel: 'Telegram-канал',
  direct_landing: 'Пряма продажа з лендингу',
}

export const FUNNEL_TYPE_HINT: Record<FunnelType, string> = {
  webinar: 'Живий вебінар з експертом. Середній/високий чек.',
  autowebinar: 'Записаний вебінар по розкладу або миттєво.',
  vsl: 'Продаюче відео на лендингу. Короткий цикл.',
  tripwire: 'Дешевий мини-продукт окупає трафік, потім продаж основного.',
  subscription: 'Нарощування бази підписників (IG, TG).',
  lead_magnet: 'Безкоштовний матеріал → прогрів → продаж.',
  telegram_channel: 'Закупка у каналах → підписка → продаж.',
  direct_landing: 'Реклама → лендинг → оплата. Без проміжних шагів.',
}

// ---------- Группа этапов (визуальная) ----------
export type StageGroup = 'entry' | 'warmup' | 'qualification' | 'payment' | 'special'

export const STAGE_GROUP_LABEL: Record<StageGroup, string> = {
  entry: 'Вхідна точка (лід)',
  warmup: 'Прогрів і залучення',
  qualification: 'Кваліфікація',
  payment: 'Продаж і оплата',
  special: 'Особливі',
}

// ---------- Шаблон этапа ----------
export type StageMetric = {
  key: string          // постфикс в стейдж-группе; уникален в пределах этапа
  label: string
  role: MetricRole
  unit?: string
  computed_from?: string[] // подкеи метрик из этого же этапа (auto-sum)
}

export type StageTemplate = {
  template: string
  label: string
  group: StageGroup
  optional?: boolean       // true = добавляется по галочке (для конкретной воронки)
  variants?: number        // если >1 — можно добавить несколько (Вебінар 1/2/3)
  /** Метрики, которые создаются при добавлении этапа. */
  metrics: StageMetric[]
  /** Подсказка для ОП. */
  hint?: string
}

// ---------- Сама библиотека ----------
export const STAGE_LIBRARY: StageTemplate[] = [
  // --- A. Вхідна точка ---
  {
    template: 'subscribe_bot',
    label: 'Підписка на бот',
    group: 'entry',
    metrics: [{ key: 'count', label: 'Підписників', role: 'applications', unit: 'шт' }],
  },
  {
    template: 'subscribe_channel',
    label: 'Підписка на канал',
    group: 'entry',
    metrics: [{ key: 'count', label: 'Підписників', role: 'applications', unit: 'шт' }],
  },
  {
    template: 'subscribe_instagram',
    label: 'Підписка в Instagram',
    group: 'entry',
    metrics: [{ key: 'count', label: 'Підписників', role: 'applications', unit: 'шт' }],
  },
  {
    template: 'webinar_reg',
    label: 'Реєстрація на вебінар',
    group: 'entry',
    metrics: [{ key: 'count', label: 'Реєстрацій', role: 'applications', unit: 'шт' }],
  },
  {
    template: 'autowebinar_reg',
    label: 'Реєстрація на автовебінар',
    group: 'entry',
    metrics: [{ key: 'count', label: 'Реєстрацій', role: 'applications', unit: 'шт' }],
  },
  {
    template: 'lead_magnet_open',
    label: 'Відкриття лід-магніту',
    group: 'entry',
    metrics: [{ key: 'count', label: 'Скачали', role: 'applications', unit: 'шт' }],
  },
  {
    template: 'vsl_view',
    label: 'Перегляд VSL відео',
    group: 'entry',
    metrics: [{ key: 'count', label: 'Перегляди', role: 'applications', unit: 'шт' }],
  },
  {
    template: 'landing_open',
    label: 'Відкриття лендингу',
    group: 'entry',
    metrics: [{ key: 'count', label: 'Відкрили', role: 'applications', unit: 'шт' }],
  },

  // --- B. Прогрів ---
  {
    template: 'webinar',
    label: 'Вебінар',
    group: 'warmup',
    variants: 3,
    metrics: [
      { key: 'total', label: 'Всього прийшли', role: 'other', unit: 'шт' },
      { key: 'peak', label: 'Пік онлайн', role: 'other', unit: 'шт' },
      { key: 'reached', label: 'Дійшли до продажу', role: 'other', unit: 'шт' },
      { key: 'applications', label: 'Заявки з вебінару', role: 'other', unit: 'шт' },
    ],
    hint: 'Може бути до 3 разів у одній воронці (Вебінар 1, 2, 3).',
  },
  {
    template: 'autowebinar',
    label: 'Автовебінар',
    group: 'warmup',
    variants: 3,
    metrics: [
      { key: 'total', label: 'Всього відкрили', role: 'other', unit: 'шт' },
      { key: 'reached', label: 'Дійшли до продажу', role: 'other', unit: 'шт' },
      { key: 'applications', label: 'Заявки з автовебу', role: 'other', unit: 'шт' },
    ],
  },
  {
    template: 'bot_chain',
    label: 'Пройшов прогрів у боті',
    group: 'warmup',
    metrics: [{ key: 'count', label: 'Пройшли', role: 'other', unit: 'шт' }],
  },
  {
    template: 'vsl_watched',
    label: 'Подивився VSL до кінця',
    group: 'warmup',
    metrics: [{ key: 'count', label: 'Додивились', role: 'other', unit: 'шт' }],
  },

  // --- C. Кваліфікація ---
  {
    template: 'filled_form',
    label: 'Заповнив анкету',
    group: 'qualification',
    metrics: [{ key: 'count', label: 'Заповнили', role: 'applications', unit: 'шт' }],
  },
  {
    template: 'application',
    label: 'Заявки на основний продукт',
    group: 'qualification',
    metrics: [
      { key: 'main', label: 'Заявки з основного', role: 'other', unit: 'шт' },
      { key: 'retry', label: 'Заявки з дожиму', role: 'other', unit: 'шт' },
      {
        key: 'total',
        label: 'Всього заявок',
        role: 'applications',
        unit: 'шт',
        computed_from: ['main', 'retry'],
      },
    ],
    hint: 'Всього = основне + дожим (рахується автоматично)',
  },
  {
    template: 'diagnostics',
    label: 'Проведена діагностика',
    group: 'qualification',
    optional: true,
    metrics: [{ key: 'count', label: 'Проведено', role: 'other', unit: 'шт' }],
    hint: 'Опціонально. Включається між «Заявкою» і «Оплатою» в будь-якій воронці.',
  },
  {
    template: 'reservation',
    label: 'Внесена бронь',
    group: 'qualification',
    optional: true,
    metrics: [
      { key: 'count', label: 'Кількість бронь', role: 'other', unit: 'шт' },
      { key: 'amount', label: 'Сума бронь', role: 'other', unit: '$' },
    ],
  },

  // --- D. Оплата ---
  {
    template: 'mini_payment',
    label: 'Оплата мини-продукту',
    group: 'payment',
    optional: true,
    metrics: [
      { key: 'count', label: 'К-сть оплат', role: 'sales', unit: 'шт' },
      { key: 'amount', label: 'Сума оплат', role: 'revenue', unit: '$' },
    ],
    hint: 'Для трипвайр-воронок або платної діагностики.',
  },
  {
    template: 'payment',
    label: 'Оплата основного',
    group: 'payment',
    metrics: [
      { key: 'count', label: 'К-сть оплат', role: 'sales', unit: 'шт' },
      { key: 'amount', label: 'Сума оплат', role: 'revenue', unit: '$' },
    ],
  },

  // --- E. Особливі ---
  {
    template: 'reactivation_out',
    label: 'Перенесений у реактивацію',
    group: 'special',
    optional: true,
    metrics: [{ key: 'count', label: 'Передано', role: 'other', unit: 'шт' }],
  },
  {
    template: 'bought_mini_not_main',
    label: 'Купив мини, але не основне',
    group: 'special',
    optional: true,
    metrics: [{ key: 'count', label: 'Лідів', role: 'other', unit: 'шт' }],
  },
]

// ---------- Параметри трафіку ----------
export type TrafficField = {
  key: string
  label: string
  role: MetricRole
  unit?: string
  always?: boolean // обов'язково при включеному трафіку
}

export const TRAFFIC_FIELDS: TrafficField[] = [
  { key: 'spent', label: 'Витрачено', role: 'traffic_spend', unit: '$', always: true },
  { key: 'budget_plan', label: 'Бюджет на місяць (план)', role: 'other', unit: '$' },
  { key: 'impressions', label: 'Покази', role: 'other', unit: 'шт' },
  { key: 'clicks', label: 'Кліки', role: 'other', unit: 'шт' },
  // CR сайту — рахується автоматично (Анкети / Кліки), не вводиться руками
  // Facebook / рекламний кабінет
  { key: 'fb_purchases', label: 'Покупки FB', role: 'other', unit: 'шт' },
  { key: 'fb_purchase_value', label: 'Сума покупок FB', role: 'other', unit: '$' },
  { key: 'fb_purchase_price', label: 'Ціна покупки FB', role: 'other', unit: '$' },
  // Діагностики / дзвінки (план vs факт у трафіку — корисно для відділу таргета)
  { key: 'diagnostics_planned', label: 'Діагностик заплановано', role: 'other', unit: 'шт' },
  { key: 'diagnostics_held', label: 'Діагностик проведено', role: 'other', unit: 'шт' },
  { key: 'calls_planned', label: 'Дзвінків заплановано', role: 'other', unit: 'шт' },
  { key: 'calls_held', label: 'Дзвінків проведено', role: 'other', unit: 'шт' },
]

// ---------- Сортування етапів за потоком ----------
const GROUP_PRIORITY: Record<StageGroup, number> = {
  entry: 1,
  warmup: 2,
  qualification: 3,
  payment: 4,
  special: 5,
}

/** Повертає priority для stage_group (з префіксом 'traffic' — 0; інакше за шаблоном). */
export function stageFlowPriority(stageGroup: string): number {
  if (stageGroup === 'traffic') return 0
  const base = stageGroup.replace(/_(\d+)$/, '')
  const tpl = STAGE_LIBRARY.find((s) => s.template === base)
  return tpl ? GROUP_PRIORITY[tpl.group] : 99
}

export const TRAFFIC_CHANNELS = [
  'Facebook',
  'Instagram',
  'Google',
  'YouTube',
  'Telegram Ads',
  'Закупка в каналах',
  'Блогери',
] as const

// ---------- Рекомендовані шаблони на тип воронки ----------
// Список ключів STAGE_LIBRARY[].template, які додаються по умовчанню при створенні воронки цього типу.
// optional етапи помічені як підказка; ОП може ввімкнути після створення.
export const FUNNEL_DEFAULTS: Record<FunnelType, string[]> = {
  webinar: ['webinar_reg', 'webinar', 'application', 'payment'],
  autowebinar: ['autowebinar_reg', 'autowebinar', 'application', 'payment'],
  vsl: ['vsl_view', 'vsl_watched', 'application', 'payment'],
  tripwire: ['vsl_view', 'mini_payment', 'application', 'payment'],
  subscription: ['subscribe_instagram'],
  lead_magnet: ['lead_magnet_open', 'application', 'payment'],
  telegram_channel: ['subscribe_channel', 'bot_chain', 'application', 'payment'],
  direct_landing: ['landing_open', 'payment'],
}

// ---------- Утиліти ----------
export function getStageTemplate(key: string): StageTemplate | undefined {
  return STAGE_LIBRARY.find((s) => s.template === key)
}

/** Згенерувати key метрики у форматі stage_group.<sub_key> для зберігання в jsonb-логу. */
export function metricKeyFor(stageGroup: string, subKey: string): string {
  return `${stageGroup}__${subKey}`
}

/**
 * Контекстне перейменування sub-метрики залежно від типу воронки.
 * Наприклад, application.main → «Заявки з Відео» для VSL, «Заявки з вебінару» для Webinar.
 * Якщо немає override, повертає дефолтний label з шаблону.
 */
const APPLICATION_MAIN_BY_TYPE: Partial<Record<FunnelType, string>> = {
  vsl: 'Заявки з Відео',
  webinar: 'Заявки з вебінару',
  autowebinar: 'Заявки з автовебінару',
  lead_magnet: 'Заявки з лід-магніту',
  telegram_channel: 'Заявки з каналу',
  subscription: 'Заявки з підписки',
  direct_landing: 'Заявки з лендингу',
  tripwire: 'Заявки з мини-продукту',
}

export function metricLabelFor(
  template: string,
  subKey: string,
  defaultLabel: string,
  funnelType: FunnelType | null,
): string {
  if (template === 'application' && subKey === 'main' && funnelType) {
    return APPLICATION_MAIN_BY_TYPE[funnelType] ?? defaultLabel
  }
  return defaultLabel
}
