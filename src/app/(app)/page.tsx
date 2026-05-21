import Link from 'next/link'
import { ArrowRight, LifeBuoy } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireProfile } from '@/lib/auth'
import { TASK_STATUS_LABEL } from '@/lib/labels'
import {
  getOpenHelpRequests,
  getProjectsProgress,
  getTodayTasks,
} from '@/lib/queries/dashboard'
import { cn } from '@/lib/utils'

export default async function DashboardPage() {
  const me = await requireProfile()
  const [progress, today, help] = await Promise.all([
    getProjectsProgress(),
    getTodayTasks(me.id),
    me.role === 'team_lead' || me.role === 'producer' ? getOpenHelpRequests() : Promise.resolve([]),
  ])

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
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Проекты — план/факт месяца</h2>
        {progress.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Нет активных проектов.{' '}
              <Link href="/projects/new" className="underline">
                Создать
              </Link>
              .
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {progress.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="group">
                <Card className="h-full transition-colors group-hover:border-foreground/30">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{p.name}</CardTitle>
                      {p.overall_progress !== null ? (
                        <Badge variant="secondary">{p.overall_progress}%</Badge>
                      ) : null}
                    </div>
                    {p.producer_name ? (
                      <p className="text-xs text-muted-foreground">Продюсер: {p.producer_name}</p>
                    ) : null}
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0">
                    {p.metrics.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Нет целей на этот месяц.
                      </p>
                    ) : (
                      p.metrics.slice(0, 3).map((m) => (
                        <div key={m.name}>
                          <div className="flex justify-between text-xs">
                            <span className="truncate">{m.name}</span>
                            <span className="text-muted-foreground">
                              {m.actual_value.toLocaleString('ru-RU')} /{' '}
                              {m.target_value.toLocaleString('ru-RU')} {m.unit ?? ''}
                            </span>
                          </div>
                          <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-muted">
                            <div
                              className={cn(
                                'h-full',
                                m.progress >= 100 ? 'bg-emerald-500' : 'bg-foreground/70',
                              )}
                              style={{ width: `${m.progress}%` }}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Сегодня</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {today.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                Нет задач на сегодня или с просроченным дедлайном.
              </p>
            ) : (
              <ul className="divide-y">
                {today.map((t) => (
                  <li key={t.id} className="px-6 py-3">
                    <Link
                      href={`/projects/${t.project_id}/tasks`}
                      className="group flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{t.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {t.project_name}
                          {t.due_date ? ` · до ${new Date(t.due_date).toLocaleDateString('ru-RU')}` : ''}
                        </div>
                      </div>
                      <Badge variant="secondary">{TASK_STATUS_LABEL[t.status as keyof typeof TASK_STATUS_LABEL] ?? t.status}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {me.role === 'team_lead' || me.role === 'producer' ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <LifeBuoy className="h-4 w-4" />
                Где нужна помощь
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {help.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">Открытых запросов нет.</p>
              ) : (
                <ul className="divide-y">
                  {help.map((h) => (
                    <li key={h.id} className="px-6 py-3">
                      <Link href="/help" className="group flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{h.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {h.project_name} · от {h.requester_name}
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
