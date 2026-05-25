import { notFound } from 'next/navigation'

import { getProject } from '@/lib/queries/projects'
import { listProducts } from '@/lib/queries/products'
import { listExpenses, listReturns } from '@/lib/queries/expenses'
import { getFunnels, getOrCreateTracker, nowYearMonth } from '@/lib/queries/tracker'
import { computeUnits, currentMonthRange } from '@/lib/units'

import { UnitsView } from './units-view'

export default async function UnitsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()

  const { year, month } = nowYearMonth()
  const tracker = await getOrCreateTracker(id, year, month)
  const [funnels, products, expenses, returns] = await Promise.all([
    getFunnels(tracker.id),
    listProducts(id),
    listExpenses(id),
    listReturns(id),
  ])

  const monthRange = currentMonthRange(year, month)
  const units = computeUnits({
    project: { work_model: project.work_model, fix_amount: project.fix_amount },
    products,
    funnels: funnels.map((f) => ({
      id: f.id,
      product_ids: f.product_ids,
      is_mini_product: f.is_mini_product,
      metrics: f.metrics,
      log: f.log,
    })),
    expenses,
    returns,
    from: monthRange.from,
    to: monthRange.to,
  })

  return <UnitsView projectId={id} project={project} products={products} units={units} expenses={expenses} returns={returns} />
}
