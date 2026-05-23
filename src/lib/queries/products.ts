import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { Product, ProductPriceHistory } from '@/lib/supabase/types'

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
