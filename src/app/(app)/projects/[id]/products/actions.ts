'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export type ProductActionState = { error?: string } | undefined

const CreateSchema = z.object({
  project_id: z.uuid(),
  name: z.string().min(1).max(200).trim(),
  current_price: z.coerce.number().min(0),
  description: z.string().max(2000).trim().optional().or(z.literal('')),
})

export async function createProduct(
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  await requireProfile()
  const parsed = CreateSchema.safeParse({
    project_id: formData.get('project_id'),
    name: formData.get('name'),
    current_price: formData.get('current_price'),
    description: formData.get('description') ?? '',
  })
  if (!parsed.success) return { error: 'Проверь поля' }

  const supabase = await createClient()
  const { data: last } = await supabase
    .from('products')
    .select('position')
    .eq('project_id', parsed.data.project_id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase.from('products').insert({
    project_id: parsed.data.project_id,
    name: parsed.data.name,
    current_price: parsed.data.current_price,
    description: parsed.data.description || null,
    position: (last?.position ?? -1) + 1,
  })
  if (error) return { error: error.message }
  revalidatePath(`/projects/${parsed.data.project_id}/products`)
  revalidatePath(`/projects/${parsed.data.project_id}`)
  return undefined
}

export async function updateProduct(formData: FormData): Promise<void> {
  await requireProfile()
  const id = formData.get('id') as string
  const project_id = formData.get('project_id') as string
  const patch: Record<string, unknown> = {}
  const name = formData.get('name')
  const price = formData.get('current_price')
  const description = formData.get('description')
  if (typeof name === 'string' && name.trim()) patch.name = name.trim()
  if (price !== null && price !== '') patch.current_price = Number(price)
  if (typeof description === 'string') patch.description = description.trim() || null
  if (Object.keys(patch).length === 0) return
  const supabase = await createClient()
  await supabase.from('products').update(patch).eq('id', id)
  revalidatePath(`/projects/${project_id}/products`)
}

export async function setProductStatus(
  productId: string,
  projectId: string,
  status: 'active' | 'archived',
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('products').update({ status }).eq('id', productId)
  revalidatePath(`/projects/${projectId}/products`)
}

// ============================================================
// Multiple prices per product
// ============================================================
export async function addProductPrice(
  productId: string,
  projectId: string,
  name: string,
  price: number,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  const { data: last } = await supabase
    .from('product_prices')
    .select('position')
    .eq('product_id', productId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  await supabase.from('product_prices').insert({
    product_id: productId,
    name,
    price,
    position: (last?.position ?? -1) + 1,
  })
  revalidatePath(`/projects/${projectId}/products`)
}

export async function deleteProductPrice(priceId: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('product_prices').delete().eq('id', priceId)
  revalidatePath(`/projects/${projectId}/products`)
}
