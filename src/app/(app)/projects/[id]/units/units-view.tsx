'use client'

import { useActionState, useState, useTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'

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
import {
  EXPENSE_KIND_LABEL,
  EXPENSE_PAYER_LABEL,
  EXPENSE_RECURRENCE_LABEL,
  WORK_MODEL_LABEL,
} from '@/lib/labels'
import type {
  ExpenseKind,
  ExpenseRecurrence,
  Product,
  Project,
  ProjectExpense,
  ProjectReturn,
} from '@/lib/supabase/types'

import type { UnitsResult } from '@/lib/units'

import {
  addExpense,
  addReturn,
  deleteExpense,
  deleteReturn,
  type ExpenseActionState,
} from './actions'

function fmt(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 })
}
function pct(x: number): string {
  return `${Math.round(x * 100)}%`
}

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none'

export function UnitsView({
  projectId,
  project,
  products,
  units,
  expenses,
  returns,
}: {
  projectId: string
  project: Project
  products: Product[]
  units: UnitsResult
  expenses: ProjectExpense[]
  returns: ProjectReturn[]
}) {
  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        Модель: <strong>{WORK_MODEL_LABEL[project.work_model]}</strong>
        {project.work_model === 'fix_pct' && project.fix_amount ? (
          <span> · фикс: <strong>{fmt(Number(project.fix_amount))} $</strong></span>
        ) : null}
      </div>

      <RevenueByProductCard units={units} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Цифри проєкту (поточний місяць)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <BigNum label="Валовая выручка" value={units.gross_revenue} />
          <BigNum label="Доля эксперта" value={units.expert_share} muted />
          <BigNum label="Доход центра" value={units.center_income} />
          <BigNum label="Витрати проєкту" value={units.center_expenses} muted />
          <BigNum label="Чистая прибыль" value={units.net_profit} highlight />
          <BigNum label="Маржинальность" value={units.margin * 100} suffix="%" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Справочно — как живёт проект для эксперта</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <BigNum label="Расход на трафик" value={units.ad_spend} muted small />
          <BigNum label="Прибыль эксперта" value={units.expert_profit} small />
          <BigNum label="ROMI" value={units.romi * 100} suffix="%" small />
          <BigNum label="ДРР" value={units.drr * 100} suffix="%" small />
        </CardContent>
      </Card>

      <ExpensesCard projectId={projectId} expenses={expenses} />

      <ReturnsCard projectId={projectId} returns={returns} products={products} />
    </div>
  )
}

function RevenueByProductCard({ units }: { units: UnitsResult }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Выручка по продуктам (месяц)</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {units.revenue_by_product.length === 0 ? (
          <p className="px-6 py-4 text-sm text-muted-foreground">Продаж в этом месяце ещё не было.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Продукт</th>
                <th className="px-3 py-2 text-right">Продаж</th>
                <th className="px-3 py-2 text-right">Выручка</th>
                <th className="px-3 py-2 text-right">% от проекта</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {units.revenue_by_product.map((r) => (
                <tr key={r.product_id ?? 'mini'}>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-right">{r.qty}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmt(r.revenue)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{pct(r.pct_of_project)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}

function ExpensesCard({ projectId, expenses }: { projectId: string; expenses: ProjectExpense[] }) {
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Витрати проєкту</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Расход
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {expenses.length === 0 ? (
          <p className="px-6 py-4 text-sm text-muted-foreground">Пока нет расходов.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Назва</th>
                <th className="px-3 py-2 text-left">Тип</th>
                <th className="px-3 py-2 text-left">Період</th>
                <th className="px-3 py-2 text-left">Платит</th>
                <th className="px-3 py-2 text-right">Сума</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {expenses.map((e) => (
                <tr key={e.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2">{e.name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{EXPENSE_KIND_LABEL[e.kind]}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {EXPENSE_RECURRENCE_LABEL[e.recurrence]}
                    {e.recurrence === 'one_off' && e.one_off_date ? (
                      <> · {new Date(e.one_off_date).toLocaleDateString('ru-RU')}</>
                    ) : null}
                    {e.recurrence === 'monthly' && e.start_date ? (
                      <> · с {new Date(e.start_date).toLocaleDateString('ru-RU')}</>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs">{EXPENSE_PAYER_LABEL[e.payer]}</td>
                  <td className="px-3 py-2 text-right">{fmt(Number(e.amount))}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm('Удалить расход?'))
                          startTransition(() => deleteExpense(e.id, projectId))
                      }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
      <NewExpenseDialog projectId={projectId} open={open} onOpenChange={setOpen} />
    </Card>
  )
}

function NewExpenseDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [state, action, pending] = useActionState<ExpenseActionState, FormData>(addExpense, undefined)
  const [recurrence, setRecurrence] = useState<ExpenseRecurrence>('monthly')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Новый расход</DialogTitle>
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
            <Label>Название</Label>
            <Input name="name" required autoFocus placeholder="GetCourse / Менеджер продаж / Монтажёр…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Тип</Label>
              <select name="kind" defaultValue="service" className={selectClass}>
                {(['service', 'fot', 'contractor', 'other'] as ExpenseKind[]).map((k) => (
                  <option key={k} value={k}>{EXPENSE_KIND_LABEL[k]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Периодичность</Label>
              <select
                name="recurrence"
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as ExpenseRecurrence)}
                className={selectClass}
              >
                <option value="monthly">Ежемесячный</option>
                <option value="one_off">Разовый</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>На кого лягає (платит)</Label>
            <select name="payer" defaultValue="project" className={selectClass}>
              <option value="project">Проект (сходить з виручки)</option>
              <option value="center">Центр</option>
              <option value="expert">Експерт</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Сумма, $</Label>
              <Input name="amount" type="number" step="any" min={0} required />
            </div>
            <div className="space-y-2">
              {recurrence === 'monthly' ? (
                <>
                  <Label>Действует с</Label>
                  <Input name="start_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
                </>
              ) : (
                <>
                  <Label>Дата расхода</Label>
                  <Input name="one_off_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
                </>
              )}
            </div>
          </div>
          {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button type="submit" disabled={pending}>{pending ? 'Сохраняем…' : 'Добавить'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ReturnsCard({
  projectId,
  returns,
  products,
}: {
  projectId: string
  returns: ProjectReturn[]
  products: Product[]
}) {
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Возвраты</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Возврат
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {returns.length === 0 ? (
          <p className="px-6 py-4 text-sm text-muted-foreground">Возвратов нет.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Дата</th>
                <th className="px-3 py-2 text-left">Продукт</th>
                <th className="px-3 py-2 text-right">Сумма</th>
                <th className="px-3 py-2 text-left">Причина</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {returns.map((r) => {
                const p = products.find((x) => x.id === r.product_id)
                return (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2">{new Date(r.day_date).toLocaleDateString('ru-RU')}</td>
                    <td className="px-3 py-2">{p?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{fmt(Number(r.amount))}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.reason ?? ''}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm('Удалить возврат?'))
                            startTransition(() => deleteReturn(r.id, projectId))
                        }}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </CardContent>
      <NewReturnDialog projectId={projectId} products={products} open={open} onOpenChange={setOpen} />
    </Card>
  )
}

function NewReturnDialog({
  projectId,
  products,
  open,
  onOpenChange,
}: {
  projectId: string
  products: Product[]
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [state, action, pending] = useActionState<ExpenseActionState, FormData>(addReturn, undefined)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Новый возврат</DialogTitle>
        </DialogHeader>
        <form
          action={(fd) => {
            action(fd)
            onOpenChange(false)
          }}
          className="space-y-3"
        >
          <input type="hidden" name="project_id" value={projectId} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Дата</Label>
              <Input name="day_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
            </div>
            <div className="space-y-2">
              <Label>Сумма, $</Label>
              <Input name="amount" type="number" step="any" min={0} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Продукт</Label>
            <select name="product_id" defaultValue="" className={selectClass}>
              <option value="">— не указан —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Причина (опционально)</Label>
            <Textarea name="reason" rows={2} />
          </div>
          {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button type="submit" disabled={pending}>{pending ? 'Сохраняем…' : 'Добавить'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function BigNum({
  label,
  value,
  highlight,
  muted,
  small,
  suffix,
}: {
  label: string
  value: number
  highlight?: boolean
  muted?: boolean
  small?: boolean
  suffix?: string
}) {
  return (
    <div className="rounded-md border bg-card/40 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={
          (small ? 'text-lg' : 'text-2xl') +
          ' mt-1 font-semibold tracking-tight' +
          (highlight ? ' text-emerald-600 dark:text-emerald-400' : '') +
          (muted ? ' text-muted-foreground' : '')
        }
      >
        {fmt(value)}
        {suffix ?? ''}
      </div>
    </div>
  )
}
