import { listProducts } from '@/lib/queries/products'
import { getAllSales, getOrCreateTracker, nowYearMonth } from '@/lib/queries/tracker'

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
  const sales = await getAllSales(tracker.id)

  // Сумма выручки по продукту за текущий месяц
  const byProduct = new Map<string, { qty: number; revenue: number }>()
  for (const s of sales) {
    const cur = byProduct.get(s.product_id) ?? { qty: 0, revenue: 0 }
    cur.qty += s.qty
    cur.revenue += Number(s.unit_price) * s.qty
    byProduct.set(s.product_id, cur)
  }

  const productsWithStats = products.map((p) => ({
    ...p,
    qty_month: byProduct.get(p.id)?.qty ?? 0,
    revenue_month: byProduct.get(p.id)?.revenue ?? 0,
  }))

  return <ProductsView projectId={id} products={productsWithStats} />
}
