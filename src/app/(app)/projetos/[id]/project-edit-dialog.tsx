'use client'

import { Pencil } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { FormErrorBanner, SubmitButton } from '@/components/ui/form-helpers'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { useUpsertFormAction } from '@/lib/use-upsert-action'
import { updateProjectAction } from '@/server/modules/projects/actions'

export function ProjectEditDialog({
  project,
  users,
}: {
  project: {
    id: string
    name: string
    ownerId: string | null
    startDate: string | null
    dueDate: string | null
    description: string | null
  }
  users: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useUpsertFormAction(
    updateProjectAction.bind(null, project.id),
    open,
    setOpen,
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="md" icon={<Pencil />}>
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader
          title="Editar projeto"
          description="Mudanças de prazo ficam registradas no histórico com o valor anterior."
        />
        <form action={formAction} className="contents">
          <DialogBody className="flex flex-col gap-4">
            <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />
            <Field label="Nome" required error={state.fieldErrors?.name?.[0]}>
              {(props) => <Input {...props} name="name" defaultValue={project.name} required />}
            </Field>
            <Field label="Responsável" error={state.fieldErrors?.ownerId?.[0]}>
              {(props) => (
                <NativeSelect {...props} name="ownerId" defaultValue={project.ownerId ?? ''}>
                  <option value="">Manter atual</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Início" error={state.fieldErrors?.startDate?.[0]}>
                {(props) => (
                  <Input
                    {...props}
                    name="startDate"
                    type="date"
                    defaultValue={project.startDate ?? ''}
                  />
                )}
              </Field>
              <Field label="Prazo final" error={state.fieldErrors?.dueDate?.[0]}>
                {(props) => (
                  <Input
                    {...props}
                    name="dueDate"
                    type="date"
                    defaultValue={project.dueDate ?? ''}
                  />
                )}
              </Field>
            </div>
            <Field label="Descrição" error={state.fieldErrors?.description?.[0]}>
              {(props) => (
                <Textarea
                  {...props}
                  name="description"
                  rows={3}
                  defaultValue={project.description ?? ''}
                />
              )}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton>Salvar</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
