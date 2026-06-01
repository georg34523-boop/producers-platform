'use client'

import { useState, useTransition } from 'react'
import { Coins, MoreVertical, Trash2, UserCog } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CURRENCY_LABEL, CURRENCY_LIST, type Currency } from '@/lib/currency'
import type { Profile } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'

import {
  changeProducer,
  deleteProject,
  inviteProducerAndAssign,
  updateProjectCurrency,
} from '../actions'

export function ProjectAdmin({
  projectId,
  projectName,
  currentProducerId,
  producers,
  currency,
  rateOverride,
  liveRate,
  liveRateUpdatedAt,
}: {
  projectId: string
  projectName: string
  currentProducerId: string | null
  producers: Profile[]
  currency: Currency
  rateOverride: number | null
  liveRate: number
  liveRateUpdatedAt: string
}) {
  const [changeOpen, setChangeOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [currencyOpen, setCurrencyOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label="Налаштування проєкту" />
          }
        >
          <MoreVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setChangeOpen(true)}>
            <UserCog className="h-4 w-4" />
            <span>Змінити продюсера</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setCurrencyOpen(true)}>
            <Coins className="h-4 w-4" />
            <span>Валюта і курс</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            <span>Видалити проєкт</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ChangeProducerDialog
        open={changeOpen}
        onOpenChange={setChangeOpen}
        projectId={projectId}
        currentProducerId={currentProducerId}
        producers={producers}
      />

      <CurrencyDialog
        open={currencyOpen}
        onOpenChange={setCurrencyOpen}
        projectId={projectId}
        currency={currency}
        rateOverride={rateOverride}
        liveRate={liveRate}
        liveRateUpdatedAt={liveRateUpdatedAt}
      />

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        projectId={projectId}
        projectName={projectName}
      />
    </>
  )
}

function ChangeProducerDialog({
  open,
  onOpenChange,
  projectId,
  currentProducerId,
  producers,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  projectId: string
  currentProducerId: string | null
  producers: Profile[]
}) {
  const [, startTransition] = useTransition()
  const [mode, setMode] = useState<'pick' | 'create'>('pick')
  const [pickedId, setPickedId] = useState<string>(currentProducerId ?? producers[0]?.id ?? '')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const submitPick = () => {
    if (!pickedId) return
    startTransition(async () => {
      const res = await changeProducer({ project_id: projectId, producer_id: pickedId })
      if (res?.error) {
        toast.error(res.error)
      } else {
        toast.success('Продюсера змінено')
        onOpenChange(false)
      }
    })
  }

  const submitCreate = () => {
    if (!fullName.trim() || !email.trim() || password.length < 8) {
      toast.error('Заповни ім\'я, email і пароль (мін. 8 символів)')
      return
    }
    startTransition(async () => {
      const res = await inviteProducerAndAssign({
        project_id: projectId,
        full_name: fullName.trim(),
        email: email.trim(),
        password,
      })
      if (res?.error) {
        toast.error(res.error)
      } else {
        toast.success(`Створено ${fullName} та призначено на проєкт`)
        setFullName('')
        setEmail('')
        setPassword('')
        setMode('pick')
        onOpenChange(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Змінити продюсера</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 rounded-md border p-1">
          <button
            type="button"
            onClick={() => setMode('pick')}
            className={`flex-1 rounded px-3 py-1.5 text-xs transition-colors ${
              mode === 'pick' ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/40'
            }`}
          >
            Існуючий
          </button>
          <button
            type="button"
            onClick={() => setMode('create')}
            className={`flex-1 rounded px-3 py-1.5 text-xs transition-colors ${
              mode === 'create' ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/40'
            }`}
          >
            Новий продюсер
          </button>
        </div>

        {mode === 'pick' ? (
          <div className="space-y-2">
            <Label className="text-xs">Продюсер</Label>
            <select
              value={pickedId}
              onChange={(e) => setPickedId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {producers.length === 0 ? (
                <option value="">— немає в системі —</option>
              ) : null}
              {producers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name ?? p.email}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Імʼя</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Олена Петренко"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="producer@email.com"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Тимчасовий пароль (мін. 8)</Label>
              <Input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="перешлеш йому окремо"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Відміна
          </Button>
          {mode === 'pick' ? (
            <Button onClick={submitPick} disabled={!pickedId || pickedId === currentProducerId}>
              Призначити
            </Button>
          ) : (
            <Button onClick={submitCreate}>Створити і призначити</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  projectId: string
  projectName: string
}) {
  const [, startTransition] = useTransition()
  const [confirm, setConfirm] = useState('')
  const expected = projectName.trim()
  const ready = confirm.trim().toLowerCase() === expected.toLowerCase() && expected.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Видалити проєкт?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            Це безповоротно видалить проєкт <span className="font-medium">«{projectName}»</span> з
            усіма трекерами, воронками, продажами, задачами, виплатами і витратами.
          </p>
          <div className="space-y-1">
            <Label className="text-xs">
              Введи назву проєкту для підтвердження:
              <span className="ml-1 font-mono text-muted-foreground">{projectName}</span>
            </Label>
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={projectName}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Відміна
          </Button>
          <Button
            variant="destructive"
            disabled={!ready}
            onClick={() =>
              startTransition(async () => {
                try {
                  await deleteProject(projectId)
                } catch (err) {
                  // redirect-throw — це нормально, redirect зрозуміє далі
                  const msg = err instanceof Error ? err.message : ''
                  if (!msg.includes('NEXT_REDIRECT')) {
                    toast.error(`Не вдалося видалити: ${msg || 'невідома помилка'}`)
                  }
                }
              })
            }
          >
            Видалити безповоротно
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CurrencyDialog({
  open,
  onOpenChange,
  projectId,
  currency,
  rateOverride,
  liveRate,
  liveRateUpdatedAt,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  projectId: string
  currency: Currency
  rateOverride: number | null
  liveRate: number
  liveRateUpdatedAt: string
}) {
  const [, startTransition] = useTransition()
  const [picked, setPicked] = useState<Currency>(currency)
  const [useOverride, setUseOverride] = useState<boolean>(rateOverride !== null)
  const [overrideValue, setOverrideValue] = useState<string>(
    rateOverride !== null ? String(rateOverride) : liveRate.toFixed(4),
  )

  const submit = () => {
    const override = useOverride ? Number(overrideValue) : null
    if (useOverride && (!Number.isFinite(override) || override == null || override <= 0)) {
      toast.error('Курс має бути числом більше 0')
      return
    }
    startTransition(async () => {
      const res = await updateProjectCurrency({
        project_id: projectId,
        currency: picked,
        usd_eur_rate_override: override,
      })
      if (res?.error) {
        toast.error(res.error)
      } else {
        toast.success('Налаштування збережено')
        onOpenChange(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Валюта і курс проєкту</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="space-y-1">
            <Label className="text-xs">Валюта проєкту (виручка, дебіторка, дашборд)</Label>
            <div className="grid grid-cols-2 gap-2">
              {CURRENCY_LIST.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setPicked(c)}
                  className={cn(
                    'rounded-md border px-3 py-2 text-sm transition-colors',
                    picked === c
                      ? 'border-foreground bg-muted font-medium'
                      : 'text-muted-foreground hover:bg-muted/30',
                  )}
                >
                  {CURRENCY_LABEL[c]}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-md border bg-card/40 p-3 text-xs">
            <div className="font-medium">Курс USD → EUR (з ECB через Frankfurter)</div>
            <div className="mt-1 text-muted-foreground">
              1 USD = {liveRate.toFixed(4)} EUR · оновлено{' '}
              {new Date(liveRateUpdatedAt).toLocaleDateString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={useOverride}
                onChange={(e) => setUseOverride(e.target.checked)}
              />
              Використати свій курс
            </label>
            {useOverride ? (
              <div className="mt-2">
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={overrideValue}
                  onChange={(e) => setOverrideValue(e.target.value)}
                  placeholder="напр. 0.92"
                  className="h-8"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Цей курс буде використовуватися для всіх розрахунків (ROAS, ROMI, конвертація
                  трафіку в валюту проєкту).
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Відміна
          </Button>
          <Button onClick={submit}>Зберегти</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
