import { listProducts } from '@/lib/queries/products'
import {
  getFunnels,
  getOrCreateTracker,
  getProjectOutstandingReceivable,
  getWeeklyPlans,
  nowYearMonth,
} from '@/lib/queries/tracker'

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

  const tracker = await getOrCreateTracker(id, year, month)
  const [funnels, weeklyPlans, products, outstandingReceivable] = await Promise.all([
    getFunnels(tracker.id),
    getWeeklyPlans(tracker.id),
    listProducts(id),
    getProjectOutstandingReceivable(id),
  ])

  return (
    <TrackerView
      projectId={id}
      tracker={tracker}
      funnels={funnels}
      weeklyPlans={weeklyPlans}
      products={products.filter((p) => p.status === 'active')}
      outstandingReceivable={outstandingReceivable}
    />
  )
}
