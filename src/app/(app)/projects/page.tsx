import Link from 'next/link'
import { Plus } from 'lucide-react'

import { requireProfile } from '@/lib/auth'
import { PROJECT_STATUS_LABEL } from '@/lib/labels'
import { listProjects } from '@/lib/queries/projects'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function ProjectsPage() {
  const me = await requireProfile()
  const projects = await listProjects()
  const canCreate = me.role === 'team_lead'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Проекты</h1>
          <p className="text-sm text-muted-foreground">
            {projects.length === 0 ? 'Пока ни одного проекта.' : `${projects.length} проект(а/ов)`}
          </p>
        </div>
        {canCreate ? (
          <Button nativeButton={false} render={<Link href="/projects/new" />}>
            <Plus className="mr-1 h-4 w-4" />
            Создать проект
          </Button>
        ) : null}
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {canCreate
              ? 'Создай первый проект — это запуск курса/продукта одного эксперта.'
              : 'Тим-лид ещё не создал проекты с твоим участием.'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="group">
              <Card className="transition-colors group-hover:border-foreground/30">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    <Badge variant={p.status === 'active' ? 'default' : 'secondary'}>
                      {PROJECT_STATUS_LABEL[p.status]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 pt-0 text-xs text-muted-foreground">
                  <div>
                    <span className="text-foreground/70">Эксперт:</span> {p.expert_name ?? '—'}
                  </div>
                  <div>
                    <span className="text-foreground/70">Продюсер:</span>{' '}
                    {p.producer?.full_name ?? p.producer?.email ?? '—'}
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
