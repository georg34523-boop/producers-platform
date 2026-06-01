import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { requireProfile } from '@/lib/auth'
import { PROJECT_STATUS_LABEL, WORK_MODEL_LABEL } from '@/lib/labels'
import { getUsdEurRate } from '@/lib/queries/currency'
import { listProfiles } from '@/lib/queries/profiles'
import { getProject, listProjects } from '@/lib/queries/projects'

import { ProjectAdmin } from './project-admin'
import { ProjectSwitcher } from './project-switcher'
import { ProjectTabs } from './project-tabs'

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const me = await requireProfile()
  const isAdmin = me.role === 'coo' || me.role === 'ceo'
  const [project, allProjects, producers, rateInfo] = await Promise.all([
    getProject(id),
    listProjects(),
    isAdmin ? listProfiles({ roles: ['producer', 'coo', 'ceo'] }) : Promise.resolve([]),
    isAdmin ? getUsdEurRate() : Promise.resolve({ rate: 0.92, fetched_at: new Date().toISOString(), source: 'fallback' as const }),
  ])
  if (!project) notFound()

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2"
            nativeButton={false}
            render={<Link href="/projects" />}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            До проектів
          </Button>
          <div className="flex items-center gap-2">
            <ProjectSwitcher
              current={{ id: project.id, expert_name: project.expert_name }}
              projects={allProjects}
            />
            {isAdmin ? (
              <ProjectAdmin
                projectId={project.id}
                projectName={project.expert_name}
                currentProducerId={project.producer_id}
                producers={producers}
                currency={project.currency}
                rateOverride={project.usd_eur_rate_override}
                liveRate={rateInfo.rate}
                liveRateUpdatedAt={rateInfo.fetched_at}
              />
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{project.expert_name}</h1>
          <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
            {PROJECT_STATUS_LABEL[project.status]}
          </Badge>
          <Badge variant="secondary">{WORK_MODEL_LABEL[project.work_model]}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Продюсер: {project.producer?.full_name ?? project.producer?.email ?? '—'}
        </p>
      </div>

      <ProjectTabs projectId={id} />
      <div>{children}</div>
    </div>
  )
}
