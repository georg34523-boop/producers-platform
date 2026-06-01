import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { requireProfile } from '@/lib/auth'
import { CURRENCY_SYMBOL } from '@/lib/currency'
import { PROJECT_STATUS_LABEL, ROLE_LABEL, WORK_MODEL_LABEL } from '@/lib/labels'
import { listDashboard, type DashboardRow } from '@/lib/queries/dashboard'
import { cn } from '@/lib/utils'

const FLAG_DOT = {
  red: 'bg-red-500',
  yellow: 'bg-amber-500',
  green: 'bg-emerald-500',
  success: 'bg-emerald-500',
  rocket: 'bg-violet-500',
} as const

const FLAG_TITLE = {
  red: 'сильно отстаём',
  yellow: 'отстаём',
  green: 'идём по плану',
  success: 'план выполнен',
  rocket: 'перевыполнение',
} as const

export default async function DashboardPage() {
  const me = await requireProfile()
  const rows = await listDashboard()
  const sorted = [...rows].sort((a, b) => {
    const order = { red: 0, yellow: 1, green: 2, success: 3, rocket: 4 } as const
    return order[a.flag] - order[b.flag]
  })
  const canCreate = me.role === 'coo' || me.role === 'ceo'

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Привет, {me.full_name ?? me.email}
          </h1>
          <p className="text-sm text-muted-foreground">
            Роль: {ROLE_LABEL[me.role]} ·{' '}
            {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        {canCreate ? (
          <Button nativeButton={false} render={<Link href="/projects/new" />}>
            + Новый проект
          </Button>
        ) : null}
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Проекты — сводка месяца</h2>
        {sorted.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              {canCreate ? (
                <>
                  Пока нет проектов.{' '}
                  <Link href="/projects/new" className="underline">
                    Создать первый
                  </Link>
                  .
                </>
              ) : (
                'Тебе ещё не назначили проекты.'
              )}
            </CardContent>
          </Card>
        ) : (
          <DashboardTable rows={sorted} />
        )}
      </section>
    </div>
  )
}

function DashboardTable({ rows }: { rows: DashboardRow[] }) {
  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Эксперт</th>
            <th className="px-3 py-2 text-left font-medium">Продюсер</th>
            <th className="px-3 py-2 text-left font-medium">Модель</th>
            <th className="px-3 py-2 text-right font-medium">Мин</th>
            <th className="px-3 py-2 text-right font-medium">Средний</th>
            <th className="px-3 py-2 text-right font-medium">Макс</th>
            <th className="px-3 py-2 text-right font-medium">Факт</th>
            <th className="px-3 py-2 text-right font-medium">%</th>
            <th className="px-3 py-2 text-center font-medium">Статус</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-muted/20">
              <td className="px-3 py-2">
                <Link href={`/projects/${r.id}`} className="font-medium hover:underline">
                  {r.expert_name}
                </Link>
                {r.status !== 'active' ? (
                  <Badge variant="secondary" className="ml-2">
                    {PROJECT_STATUS_LABEL[r.status as keyof typeof PROJECT_STATUS_LABEL]}
                  </Badge>
                ) : null}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{r.producer_name ?? '—'}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {WORK_MODEL_LABEL[r.work_model as keyof typeof WORK_MODEL_LABEL] ?? r.work_model}
              </td>
              <td className="px-3 py-2 text-right text-xs">{r.revenue_plan_min.toLocaleString('ru-RU')}</td>
              <td className="px-3 py-2 text-right">{r.revenue_plan_avg.toLocaleString('ru-RU')}</td>
              <td className="px-3 py-2 text-right text-xs">{r.revenue_plan_max.toLocaleString('ru-RU')}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                <div className="font-medium">
                  {r.revenue_actual.toLocaleString('ru-RU')} {CURRENCY_SYMBOL[r.currency]}
                </div>
                {r.receivable_outstanding > 0 ? (
                  <div className="text-[10px] text-amber-600 dark:text-amber-400">
                    дебіт. {r.receivable_outstanding.toLocaleString('ru-RU')} {CURRENCY_SYMBOL[r.currency]}
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{r.has_tracker ? `${r.expected_pct}%` : '—'}</td>
              <td className="px-3 py-2 text-center">
                {r.has_tracker ? (
                  <span title={FLAG_TITLE[r.flag]} className={cn('inline-block h-2.5 w-2.5 rounded-full', FLAG_DOT[r.flag])} />
                ) : (
                  <span className="text-xs text-muted-foreground">нет трекера</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
