'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'

import { Switch } from '@/components/ui/toggle'
import { setTemplateActiveAction } from '@/server/modules/admin/actions'

export function TemplateToggle({
  templateId,
  name,
  isActive,
}: {
  templateId: string
  name: string
  isActive: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Switch
      checked={isActive}
      disabled={pending}
      aria-label={isActive ? `Desativar ${name}` : `Ativar ${name}`}
      onCheckedChange={(checked) =>
        startTransition(async () => {
          const result = await setTemplateActiveAction(templateId, checked)
          if (result.status === 'error') toast.error(result.message ?? 'Não foi possível salvar.')
          else toast.success(result.message ?? 'Template atualizado.')
          router.refresh()
        })
      }
    />
  )
}
