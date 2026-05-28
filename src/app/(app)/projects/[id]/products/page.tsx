import { listProductPrices, listProducts } from '@/lib/queries/products'
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
  const [products, prices] = await Promise.all([listProducts(id), listProductPrices(id)])
  const pricesByProduct = new Map<string, typeof prices>()
  for (const p of prices) {
    if (!pricesByProduct.has(p.product_id)) pricesByProduct.set(p.product_id, [])
    pricesByProduct.get(p.product_id)!.push(p)
  }
  const { year, month } = nowYearMonth()
  const tracker = await getOrCreateTracker(id, year, month)
  const funnels = await getFunnels(tracker.id)

  // Аггрегируем выручку и кол-во продаж через привязку воронка→продукт (m:m, ділимо порівну)
  const byProduct = new Map<string, { qty: number; revenue: number }>()
  for (const f of funnels) {
    const pids = f.product_ids
    if (pids.length === 0) continue
    const t = funnelSemanticTotals(f)
    const shareRev = t.revenue / pids.length
    const shareQty = t.sales / pids.length
    for (const pid of pids) {
      const cur = byProduct.get(pid) ?? { qty: 0, revenue: 0 }
      cur.qty += shareQty
      cur.revenue += shareRev
      byProduct.set(pid, cur)
    }
  }

  const productsWithStats = products.map((p) => ({
    ...p,
    qty_month: byProduct.get(p.id)?.qty ?? 0,
    revenue_month: byProduct.get(p.id)?.revenue ?? 0,
    prices: pricesByProduct.get(p.id) ?? [],
  }))

  return <ProductsView projectId={id} products={productsWithStats} />
}
