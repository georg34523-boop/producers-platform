import { redirect } from 'next/navigation'

import {
  getDailyLogs,
  getFunnels,
  getOrCreateTracker,
  nowYearMonth,
} from '@/lib/queries/trackers'

import { TrackerView } from './tracker-view'

export default async function TrackerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ym?: string }>
}) {
  const { id } = await params
  const { ym } = await searchParams

  let year: number
  let month: number
  if (ym && /^\d{4}-\d{1,2}$/.test(ym)) {
    const [y, m] = ym.split('-').map(Number)
    year = y!
    month = m!
  } else {
    const cur = nowYearMonth()
    year = cur.year
    month = cur.month
  }

  if (month < 1 || month > 12) redirect(`/projects/${id}/tracker`)

  const tracker = await getOrCreateTracker(id, year, month)
  const [dailyLogs, funnels] = await Promise.all([
    getDailyLogs(tracker.id),
    getFunnels(tracker.id),
  ])

  return (
    <TrackerView
      projectId={id}
      tracker={tracker}
      dailyLogs={dailyLogs}
      funnels={funnels}
    />
  )
}
