'use client'

import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { deleteRoleAction } from '@/server/modules/admin/actions'

export function DeleteRoleButton({
  roleId,
  name,
  disabledReason,
  icon,
}: {
  roleId: string
  name: string
  disabledReason?: string
  icon?: ReactNode
}) {
  const router = useRouter()

  if (disabledReason) {
    return (
      <Button variant="danger-ghost" size="sm" icon={icon} disabled title={disabledReason}>
        Excluir
      </Button>
    )
  }

  return (
    <ConfirmButton
      label="Excluir"
      icon={icon}
      variant="danger-ghost"
      title={`Excluir o perfil ${name}?`}
      description="O perfil deixa de existir. A exclusão fica registrada na auditoria."
      confirmLabel="Excluir"
      action={() => deleteRoleAction(roleId)}
      onSuccess={() => router.push('/configuracoes/perfis')}
    />
  )
}
