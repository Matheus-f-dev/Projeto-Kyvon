'use client'

import { Crown, UserPlus, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { Panel, PanelHeader } from '@/components/ui/panel'
import {
  addProjectMemberAction,
  removeProjectMemberAction,
} from '@/server/modules/projects/actions'
import type { ProjectMember } from '@/server/modules/projects/queries'

/**
 * Equipe do projeto.
 *
 * Fazer parte da equipe é o que permite editar o projeto e suas tarefas sem a
 * permissão de gestão ampla (`docs/permissions.md`, seção 5) — por isso a
 * equipe é explícita e editável, e não inferida de quem tem tarefa.
 */
export function TeamPanel({
  projectId,
  ownerId,
  members,
  users,
  canEdit,
}: {
  projectId: string
  ownerId: string | null
  members: ProjectMember[]
  users: { id: string; name: string }[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState('')

  const memberIds = new Set(members.map((member) => member.id))
  const available = users.filter((user) => !memberIds.has(user.id))

  const run = (fn: () => Promise<{ status: string; message?: string }>, after?: () => void) => {
    startTransition(async () => {
      const result = await fn()
      if (result.status === 'error') {
        toast.error(result.message)
        return
      }
      toast.success(result.message ?? 'Equipe atualizada.')
      after?.()
      router.refresh()
    })
  }

  const add = () => {
    if (!userId) return
    const formData = new FormData()
    formData.set('projectId', projectId)
    formData.set('userId', userId)
    formData.set('roleInProject', role)
    run(
      () => addProjectMemberAction(formData),
      () => {
        setUserId('')
        setRole('')
        setAdding(false)
      },
    )
  }

  return (
    <Panel>
      <PanelHeader
        title="Equipe"
        description={`${members.length} ${members.length === 1 ? 'pessoa' : 'pessoas'}`}
        actions={
          canEdit && available.length > 0 && !adding ? (
            <Button variant="ghost" size="sm" icon={<UserPlus />} onClick={() => setAdding(true)}>
              Adicionar
            </Button>
          ) : undefined
        }
      />
      {adding && (
        <div className="border-line flex flex-col gap-2 border-b px-4 py-3">
          <NativeSelect
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            aria-label="Pessoa"
          >
            <option value="">Selecione…</option>
            {available.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </NativeSelect>
          <Input
            value={role}
            onChange={(event) => setRole(event.target.value)}
            placeholder="Papel no projeto (opcional), ex.: UI Designer"
            aria-label="Papel no projeto"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={add} disabled={!userId} loading={pending}>
              Adicionar
            </Button>
          </div>
        </div>
      )}
      <ul className="divide-y divide-[var(--line-subtle)]">
        {members.map((member) => (
          <li key={member.id} className="group flex items-center gap-2.5 px-4 py-2.5">
            <Avatar name={member.name} src={member.avatarUrl} size="sm" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-strong flex items-center gap-1 truncate text-sm">
                {member.name}
                {member.id === ownerId && (
                  <Crown className="text-warning size-3 shrink-0" aria-label="Responsável" />
                )}
              </span>
              <span className="text-2xs text-muted truncate">
                {member.roleInProject ??
                  member.jobTitle ??
                  (member.id === ownerId ? 'Responsável' : 'Membro')}
              </span>
            </div>
            {canEdit && member.id !== ownerId && (
              <button
                type="button"
                onClick={() => run(() => removeProjectMemberAction(projectId, member.id))}
                className="text-subtle hover:text-danger-text opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Remover ${member.name} da equipe`}
              >
                <X className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  )
}
