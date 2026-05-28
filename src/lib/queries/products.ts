import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { Product, ProductPrice, ProductPriceHistory } from '@/lib/supabase/types'

export async function listProducts(projectId: string): Promise<Product[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('project_id', projectId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as Product[]
}

export async function listProductPrices(projectId: string): Promise<ProductPrice[]> {
  const supabase = await createClient()
  // Підтягуємо ціни тільки для продуктів цього проекту
  const { data: products } = await supabase.from('products').select('id').eq('project_id', projectId)
  const ids = (products ?? []).map((p) => p.id)
  if (ids.length === 0) return []
  const { data } = await supabase
    .from('product_prices')
    .select('*')
    .in('product_id', ids)
    .order('position')
  return (data ?? []) as ProductPrice[]
}

export async function listPriceHistory(productId: string): Promise<ProductPriceHistory[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('product_price_history')
    .select('*')
    .eq('product_id', productId)
    .order('changed_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as ProductPriceHistory[]
}
