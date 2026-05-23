import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireProfile } from '@/lib/auth'
import { PROJECT_STATUS_LABEL, WORK_MODEL_LABEL } from '@/lib/labels'
import { listProjects } from '@/lib/queries/projects'

export default async function ProjectsPage() {
  const me = await requireProfile()
  const list = await listProjects()
  const canCreate = me.role === 'coo' || me.role === 'ceo'

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Проекты</h1>
          <p className="text-sm text-muted-foreground">
            {list.length === 0 ? 'Пока ни одного проекта.' : `${list.length} проект(а/ов)`}
          </p>
        </div>
        {canCreate ? (
          <Button nativeButton={false} render={<Link href="/projects/new" />}>
            + Новый проект
          </Button>
        ) : null}
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {canCreate ? 'Создай первый проект — это эксперт со своим оффером.' : 'Тебе ещё не назначили проекты.'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="group">
              <Card className="h-full transition-colors group-hover:border-foreground/30">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{p.expert_name}</CardTitle>
                    <Badge variant={p.status === 'active' ? 'default' : 'secondary'}>
                      {PROJECT_STATUS_LABEL[p.status]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 pt-0 text-xs text-muted-foreground">
                  <div>
                    <span className="text-foreground/70">Продюсер:</span>{' '}
                    {p.producer?.full_name ?? p.producer?.email ?? '—'}
                  </div>
                  <div>
                    <span className="text-foreground/70">Модель:</span> {WORK_MODEL_LABEL[p.work_model]}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
