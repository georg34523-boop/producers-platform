import { listProducts } from '@/lib/queries/products'
import {
  funnelSemanticTotals,
  getFunnels,
  getOrCreateTracker,
  nowYearMonth,
} from '@/lib/queries/tracker'

import { ProductsView } from './products-view'

export default async function ProductsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const products = await listProducts(id)
  const { year, month } = nowYearMonth()
  const tracker = await getOrCreateTracker(id, year, month)
  const funnels = await getFunnels(tracker.id)

  // Аггрегируем выручку и кол-во продаж через привязку воронка→продукт
  const byProduct = new Map<string, { qty: number; revenue: number }>()
  for (const f of funnels) {
    if (f.is_mini_product || !f.product_id) continue
    const t = funnelSemanticTotals(f)
    const cur = byProduct.get(f.product_id) ?? { qty: 0, revenue: 0 }
    cur.qty += t.sales
    cur.revenue += t.revenue
    byProduct.set(f.product_id, cur)
  }

  const productsWithStats = products.map((p) => ({
    ...p,
    qty_month: byProduct.get(p.id)?.qty ?? 0,
    revenue_month: byProduct.get(p.id)?.revenue ?? 0,
  }))

  return <ProductsView projectId={id} products={productsWithStats} />
}
