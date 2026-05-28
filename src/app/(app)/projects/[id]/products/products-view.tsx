'use client'

import { useActionState, useState, useTransition } from 'react'
import { Archive, ArchiveRestore, Plus, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Product } from '@/lib/supabase/types'

import type { ProductPrice } from '@/lib/supabase/types'

import {
  addProductPrice,
  createProduct,
  deleteProductPrice,
  setProductStatus,
  updateProduct,
  type ProductActionState,
} from './actions'

type ProductWithStats = Product & { qty_month: number; revenue_month: number; prices: ProductPrice[] }

function fmt(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 })
}

export function ProductsView({
  projectId,
  products,
}: {
  projectId: string
  products: ProductWithStats[]
}) {
  const [newOpen, setNewOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const visible = products.filter((p) => (showArchived ? true : p.status === 'active'))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {products.length} продукт(ов), активных: {products.filter((p) => p.status === 'active').length}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Скрыть архив' : 'Показать архив'}
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Добавить продукт
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Продуктов нет. Заведи основной курс / наставничество / клуб.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((p) => (
            <ProductRow key={p.id} product={p} projectId={projectId} />
          ))}
        </div>
      )}

      <NewProductDialog projectId={projectId} open={newOpen} onOpenChange={setNewOpen} />
    </div>
  )
}

function ProductRow({ product, projectId }: { product: ProductWithStats; projectId: string }) {
  const [, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const isArchived = product.status === 'archived'

  return (
    <Card>
      <CardContent className="p-4">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              fd.set('id', product.id)
              fd.set('project_id', projectId)
              startTransition(async () => {
                await updateProduct(fd)
                setEditing(false)
              })
            }}
            className="space-y-3"
          >
            <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
              <div className="space-y-1">
                <Label className="text-xs">Название</Label>
                <Input name="name" defaultValue={product.name} required />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Цена, $</Label>
                <Input name="current_price" type="number" step="any" defaultValue={product.current_price} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Описание</Label>
              <Textarea name="description" rows={2} defaultValue={product.description ?? ''} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Отмена
              </Button>
              <Button type="submit" size="sm">Сохранить</Button>
            </div>
          </form>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{product.name}</span>
                {isArchived ? <Badge variant="secondary">В архиве</Badge> : null}
              </div>
              {product.description ? (
                <p className="mt-1 text-xs text-muted-foreground">{product.description}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Базова ціна: <strong className="text-foreground">{fmt(Number(product.current_price))} $</strong></span>
                <span>Місяць: <strong className="text-foreground">{fmt(product.qty_month)} продажів · {fmt(product.revenue_month)} $</strong></span>
              </div>
              <PriceTiers product={product} projectId={projectId} />
            </div>
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                Изменить
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() =>
                  startTransition(() => setProductStatus(product.id, projectId, isArchived ? 'active' : 'archived'))
                }
                title={isArchived ? 'Вернуть в активные' : 'В архив'}
              >
                {isArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PriceTiers({ product, projectId }: { product: ProductWithStats; projectId: string }) {
  const [, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  return (
    <div className="mt-3 rounded-md border bg-muted/20 p-2">
      <div className="mb-1 text-[11px] font-medium text-muted-foreground">Додаткові тарифи / ціни</div>
      {product.prices.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Додай тарифи (наприклад: «Базовий», «Стандарт», «Преміум»).</p>
      ) : (
        <ul className="space-y-1">
          {product.prices.map((tier) => (
            <li key={tier.id} className="flex items-center justify-between gap-2 text-xs">
              <span>{tier.name}</span>
              <span className="font-medium">{fmt(Number(tier.price))} $</span>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => startTransition(() => deleteProductPrice(tier.id, projectId))}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1 grid grid-cols-[1fr_90px_auto] gap-1">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Назва" className="h-7 text-xs" />
        <Input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="$"
          className="h-7 text-xs"
        />
        <Button
          size="sm"
          disabled={!name.trim() || !price}
          onClick={() => {
            startTransition(async () => {
              await addProductPrice(product.id, projectId, name.trim(), Number(price))
              setName('')
              setPrice('')
            })
          }}
        >
          +
        </Button>
      </div>
    </div>
  )
}

function NewProductDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [state, action, pending] = useActionState<ProductActionState, FormData>(createProduct, undefined)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Новый продукт</DialogTitle>
        </DialogHeader>
        <form
          action={(fd) => {
            action(fd)
            onOpenChange(false)
          }}
          className="space-y-3"
        >
          <input type="hidden" name="project_id" value={projectId} />
          <div className="space-y-2">
            <Label htmlFor="np-name">Название</Label>
            <Input id="np-name" name="name" required autoFocus placeholder="Профессия SMM / Наставничество…" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="np-price">Цена, $</Label>
            <Input id="np-price" name="current_price" type="number" min={0} step="any" required defaultValue={0} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="np-desc">Описание (опционально)</Label>
            <Textarea id="np-desc" name="description" rows={2} />
          </div>
          {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Создаём…' : 'Создать'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
