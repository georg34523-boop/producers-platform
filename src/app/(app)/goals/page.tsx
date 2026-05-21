import Link from 'next/link'

import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

type Row = {
  id: string
  title: string
  period_start: string
  period_end: string
  project: { id: string; name: string }
  metrics: { name: string; unit: string | null; target_value: number; actual_value: number }[]
}

function pct(actual: number, target: number) {
  if (target <= 0) return 0
  return Math.min(100, Math.round((actual / target) * 100))
}

function thisMonthStart(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export default async function GoalsOverviewPage() {
  const supabase = await createClient()
  const month = thisMonthStart()

  const { data } = await supabase
    .from('goals')
    .select(
      `id, title, period_start, period_end,
       project:projects!goals_project_id_fkey(id, name),
       metrics:goal_metrics(name, unit, target_value, actual_value)`,
    )
    .eq('period_type', 'month')
    .eq('period_start', month)
    .order('created_at', { ascending: false })

  const goals = (data ?? []) as unknown as Row[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Цели — обзор</h1>
        <p className="text-sm text-muted-foreground">
          Цели текущего месяца по всем проектам. Редактирование — в карточке проекта на вкладке «Цели».
        </p>
      </div>

      {goals.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 py-12 text-center text-sm text-muted-foreground">
            <p>Цели на этот месяц ещё не созданы.</p>
            <p>
              Открой <Link href="/projects" className="underline">проект</Link> → вкладка «Цели» → «Цель месяца».
            </p>
            <p className="text-xs">
              Метрики цели — это любые числовые показатели: выручка, кол-во заявок,
              стадии воронки (охват / регистрации / продажи), кол-во кастдевов и т.д.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {goals.map((g) => (
            <Card key={g.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">
                      <Link
                        href={`/projects/${g.project.id}/goals`}
                        className="hover:underline"
                      >
                        {g.title}
                      </Link>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Проект: {g.project.name}
                    </div>
                  </div>
                </div>
                {g.metrics.length === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">Метрик пока нет</p>
                ) : (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {g.metrics.map((m, i) => {
                      const p = pct(m.actual_value, m.target_value)
                      return (
                        <div key={i} className="rounded-md border bg-card/40 p-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="truncate">{m.name}</span>
                            <span className="font-medium">{p}%</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {m.actual_value.toLocaleString('ru-RU')} / {m.target_value.toLocaleString('ru-RU')} {m.unit ?? ''}
                          </div>
                          <div className="mt-1 h-1 overflow-hidden rounded bg-muted">
                            <div
                              className={cn(
                                'h-full',
                                p >= 100 ? 'bg-emerald-500' : 'bg-foreground/70',
                              )}
                              style={{ width: `${p}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
