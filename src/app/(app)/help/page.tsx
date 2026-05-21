import { redirect } from 'next/navigation'

import { requireProfile } from '@/lib/auth'
import { listHelpRequests } from '@/lib/queries/help'
import { listProjects } from '@/lib/queries/projects'

import { HelpView } from './help-view'

export default async function HelpPage() {
  const me = await requireProfile()
  if (me.role !== 'team_lead' && me.role !== 'producer') redirect('/')

  const [requests, projects] = await Promise.all([listHelpRequests(), listProjects()])
  return <HelpView me={me} requests={requests} projects={projects} />
}
