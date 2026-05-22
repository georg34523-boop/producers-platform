import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { requireProfile } from '@/lib/auth'
import { PROJECT_STATUS_LABEL } from '@/lib/labels'
import { listProjectsWithCurrentTracker } from '@/lib/queries/dashboard'
import { cn } from '@/lib/utils'

const FLAG_COLOR = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
}

export default async function DashboardPage() {
  const me = await requireProfile()
  const result = await listProjectsWithCurrentTracker()

  if (!result.ok) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Привет, {me.full_name ?? me.email}
          </h1>
        </div>
        <Card>
          <CardContent className="space-y-2 py-12 text-center text-sm">
            {result.needsMigration ? (
              <>
                <p className="font-medium">
                  Нужно прогнать миграцию <code className="rounded bg-muted px-1">0004_tz_pivot.sql</code>
                </p>
                <p className="text-muted-foreground">
                  Открой Supabase → SQL Editor → вставь содержимое файла → Run. Потом перезагрузи страницу.
                </p>
              </>
            ) : (
              <p className="text-destructive">Ошибка: {result.error}</p>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const rows = result.rows
  const sorted = [...rows].sort((a, b) => {
    const order = { red: 0, yellow: 1, green: 2 } as const
    return order[a.flag] - order[b.flag]
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Привет, {me.full_name ?? me.email}
        </h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString('ru-RU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Сводка месяца — все эксперты
        </h2>
        {sorted.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Ещё нет активных экспертов.{' '}
              <Link href="/projects/new" className="underline">
                Добавить
              </Link>
              .
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Эксперт</th>
                  <th className="px-3 py-2 text-left font-medium">Продюсер</th>
                  <th className="px-3 py-2 text-left font-medium">Статус</th>
                  <th className="px-3 py-2 text-right font-medium">План</th>
                  <th className="px-3 py-2 text-right font-medium">Факт</th>
                  <th className="px-3 py-2 text-right font-medium">%</th>
                  <th className="px-3 py-2 text-center font-medium">Флаг</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <Link href={`/projects/${r.id}/tracker`} className="font-medium hover:underline">
                        {r.expert_name ?? r.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.producer_name ?? '—'}</td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary">
                        {PROJECT_STATUS_LABEL[r.status as keyof typeof PROJECT_STATUS_LABEL] ?? r.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">{r.revenue_plan.toLocaleString('ru-RU')}</td>
                    <td className="px-3 py-2 text-right">{r.revenue_actual.toLocaleString('ru-RU')}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {r.has_tracker ? `${r.revenue_pct}%` : '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r.has_tracker ? (
                        <span className={cn('inline-block h-2.5 w-2.5 rounded-full', FLAG_COLOR[r.flag])} />
                      ) : (
                        <span className="text-xs text-muted-foreground">нет трекера</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
