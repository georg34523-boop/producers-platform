import { redirect } from 'next/navigation'

import { requireProfile } from '@/lib/auth'
import { listProfiles } from '@/lib/queries/profiles'
import { ProjectForm } from '../project-form'

export default async function NewProjectPage() {
  const me = await requireProfile()
  if (me.role !== 'team_lead') redirect('/projects')

  const producers = await listProfiles({ roles: ['producer', 'team_lead'] })

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Новый проект</h1>
        <p className="text-sm text-muted-foreground">
          Проект — один эксперт и его запуск курса/продукта.
        </p>
      </div>
      <ProjectForm producers={producers} />
    </div>
  )
}
