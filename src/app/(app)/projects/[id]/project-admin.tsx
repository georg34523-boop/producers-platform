'use client'

import { useState, useTransition } from 'react'
import { MoreVertical, Trash2, UserCog } from 'lucide-react'
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
import type { Profile } from '@/lib/supabase/types'

import {
  changeProducer,
  deleteProject,
  inviteProducerAndAssign,
} from '../actions'

export function ProjectAdmin({
  projectId,
  projectName,
  currentProducerId,
  producers,
}: {
  projectId: string
  projectName: string
  currentProducerId: string | null
  producers: Profile[]
}) {
  const [changeOpen, setChangeOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

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
