import { notFound } from 'next/navigation'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getProject } from '@/lib/queries/projects'

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()

  return (
    <div className="space-y-6">
      {project.description ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Описание</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{project.description}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Цели месяца</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Перейди во вкладку «Цели», чтобы добавить цели и метрики.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Задачи</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Канбан с подзадачами, чек-листами, комментариями.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">База знаний</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Файлы по проекту: договора, таблицы, документы.
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
