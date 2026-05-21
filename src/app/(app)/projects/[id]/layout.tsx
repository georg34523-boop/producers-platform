import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PROJECT_STATUS_LABEL } from '@/lib/labels'
import { getProject } from '@/lib/queries/projects'

import { ProjectTabs } from './project-tabs'

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2"
          nativeButton={false}
          render={<Link href="/projects" />}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          К проектам
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
            {PROJECT_STATUS_LABEL[project.status]}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Эксперт: {project.expert_name ?? '—'} · Продюсер:{' '}
          {project.producer?.full_name ?? project.producer?.email ?? '—'}
        </p>
      </div>

      <ProjectTabs projectId={id} />
      <div>{children}</div>
    </div>
  )
}
