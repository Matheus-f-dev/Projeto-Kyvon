'use client'

import { FolderPlus } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
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
import { createProjectAction } from '@/server/modules/projects/actions'

export interface CreateProjectPreset {
  name?: string
  client?: ComboboxOption
  contractId?: string
  contractLabel?: string
}

/**
 * Criar projeto.
 *
 * "Deseja utilizar um template?" (item 37 do produto) é a primeira pergunta do
 * formulário, não uma opção escondida: com template, o projeto nasce com
 * etapas, tarefas, checklists, prazos e responsáveis sugeridos.
 *
 * Aberto a partir de um contrato, cliente e contrato vêm travados — o cliente
 * do projeto é sempre o do contrato (regra 4), e o service o deriva de novo
 * no servidor de qualquer forma.
 */
export function CreateProjectDialog({
  templates,
  owners,
  preset,
  trigger,
  defaultOpen = false,
}: {
  templates: { id: string; name: string; description: string | null }[]
  owners: { id: string; name: string }[]
  preset?: CreateProjectPreset
  trigger?: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const [state, formAction] = useUpsertFormAction(createProjectAction, open, setOpen)

  const selectedTemplate = templates.find((template) => template.id === templateId)
  const fromContract = Boolean(preset?.contractId)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="primary" size="md" icon={<FolderPlus />}>
            Novo projeto
          </Button>
        )}
      </DialogTrigger>

      <DialogContent size="md">
        <DialogHeader
          title="Novo projeto"
          description={
            fromContract ? `A partir do contrato ${preset?.contractLabel ?? ''}` : undefined
          }
        />
        <form action={formAction} className="contents">
          {preset?.contractId && (
            <input type="hidden" name="contractId" value={preset.contractId} />
          )}

          <DialogBody className="flex flex-col gap-4">
            <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />

            <Field
              label="Template"
              hint={
                selectedTemplate?.description ??
                'Sem template, o projeto nasce vazio — etapas e tarefas são criadas à mão.'
              }
              error={state.fieldErrors?.templateId?.[0]}
            >
              {(props) => (
                <NativeSelect
                  {...props}
                  name="templateId"
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                  <option value="">Sem template</option>
                </NativeSelect>
              )}
            </Field>

            <Field label="Nome do projeto" required error={state.fieldErrors?.name?.[0]}>
              {(props) => <Input {...props} name="name" defaultValue={preset?.name} required />}
            </Field>

            <Field label="Cliente" required error={state.fieldErrors?.clientId?.[0]}>
              {() => (
                <Combobox
                  name="clientId"
                  endpoint="/api/clients/options"
                  placeholder="Buscar cliente…"
                  defaultValue={preset?.client}
                  disabled={fromContract}
                  required
                />
              )}
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Início"
                hint="Base dos prazos do template."
                error={state.fieldErrors?.startDate?.[0]}
              >
                {(props) => <Input {...props} name="startDate" type="date" />}
              </Field>
              <Field label="Prazo final" error={state.fieldErrors?.dueDate?.[0]}>
                {(props) => <Input {...props} name="dueDate" type="date" />}
              </Field>
            </div>

            <Field label="Responsável" error={state.fieldErrors?.ownerId?.[0]}>
              {(props) => (
                <NativeSelect {...props} name="ownerId" defaultValue="">
                  <option value="">Eu mesmo</option>
                  {owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>

            <Field label="Descrição" error={state.fieldErrors?.description?.[0]}>
              {(props) => <Textarea {...props} name="description" rows={2} />}
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton>
              {templateId ? 'Criar projeto com template' : 'Criar projeto'}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
