'use client'

import { useActionState, useState, useTransition } from 'react'
import { CheckCircle2, Plus, RotateCcw, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import type { HelpRow } from '@/lib/queries/help'
import type { ProjectWithPeople } from '@/lib/queries/projects'
import type { HelpStatus, Profile } from '@/lib/supabase/types'

import {
  createHelpRequest,
  deleteHelpRequest,
  type HelpActionState,
  setHelpStatus,
} from './actions'

const STATUS_LABEL: Record<HelpStatus, string> = {
  open: 'Открыт',
  in_progress: 'В работе',
  resolved: 'Решён',
}

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs ' +
  'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none'

export function HelpView({
  me,
  requests,
  projects,
}: {
  me: Profile
  requests: HelpRow[]
  projects: ProjectWithPeople[]
}) {
  const [newOpen, setNewOpen] = useState(false)
  const [filter, setFilter] = useState<'all' | 'open'>('all')
  const visible = requests.filter((r) =>
    filter === 'all' ? true : r.status !== 'resolved',
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Запросы помощи</h1>
          <p className="text-sm text-muted-foreground">
            Очередь от продюсеров — видна тим-лиду и всем продюсерам.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter(filter === 'all' ? 'open' : 'all')}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {filter === 'all' ? 'Только открытые' : 'Показать все'}
          </button>
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Создать запрос
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Пока ни одного запроса.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => (
            <HelpCard key={r.id} request={r} me={me} />
          ))}
        </div>
      )}

      <NewHelpDialog
        projects={projects}
        open={newOpen}
        onOpenChange={setNewOpen}
      />
    </div>
  )
}

function HelpCard({ request, me }: { request: HelpRow; me: Profile }) {
  const [, startTransition] = useTransition()
  const canManage = me.role === 'team_lead' || request.requester_id === me.id

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{request.title}</span>
              <Badge
                variant={
                  request.status === 'resolved'
                    ? 'secondary'
                    : request.status === 'in_progress'
                      ? 'default'
                      : 'default'
                }
              >
                {STATUS_LABEL[request.status]}
              </Badge>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {request.project.name} · {request.requester.full_name ?? request.requester.email} ·{' '}
              {new Date(request.created_at).toLocaleString('ru-RU')}
            </div>
            {request.body ? (
              <p className="mt-2 text-sm whitespace-pre-wrap">{request.body}</p>
            ) : null}
          </div>
          {canManage ? (
            <div className="flex shrink-0 gap-1">
              {request.status !== 'resolved' ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => startTransition(() => setHelpStatus(request.id, 'resolved'))}
                >
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                  Закрыть
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => startTransition(() => setHelpStatus(request.id, 'open'))}
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Переоткрыть
                </Button>
              )}
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Удалить"
                onClick={() => {
                  if (confirm('Удалить запрос?')) startTransition(() => deleteHelpRequest(request.id))
                }}
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function NewHelpDialog({
  projects,
  open,
  onOpenChange,
}: {
  projects: ProjectWithPeople[]
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [state, action, pending] = useActionState<HelpActionState, FormData>(
    createHelpRequest,
    undefined,
  )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Запросить помощь у тим-лида</DialogTitle>
        </DialogHeader>
        <form
          action={(fd) => {
            action(fd)
            onOpenChange(false)
          }}
          className="space-y-3"
        >
          <div className="space-y-2">
            <Label htmlFor="h-project">Проект</Label>
            <select id="h-project" name="project_id" required defaultValue="" className={selectClass}>
              <option value="" disabled>
                — выбери проект —
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="h-title">Что нужно?</Label>
            <Input id="h-title" name="title" required autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="h-body">Подробности</Label>
            <Textarea id="h-body" name="body" rows={4} placeholder="Контекст, ссылки, что уже пробовал" />
          </div>
          {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Отправляем…' : 'Отправить'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
