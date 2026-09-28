import { redirect } from 'next/navigation'

import { AppShell } from '@/components/layout/app-shell'
import { getAuthContext } from '@/server/auth/context'
import { countUnread } from '@/server/modules/notifications/service'
import type { PermissionKey } from '@/shared/permissions'

/**
 * Layout autenticado.
 *
 * O middleware só checa se existe cookie. Aqui a sessão é de fato validada
 * contra o banco — é este o ponto que impede um cookie forjado ou revogado de
 * chegar a qualquer página interna.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await getAuthContext()
  if (!context) redirect('/login')

  const unreadNotifications = await countUnread(context.user.id)

  return (
    <AppShell
      user={{
        id: context.user.id,
        name: context.user.name,
        email: context.user.email,
        avatarUrl: context.user.avatarUrl,
        roleName: context.user.roleName,
        jobTitle: context.user.jobTitle,
      }}
      permissions={[...context.permissions] as PermissionKey[]}
      unreadNotifications={unreadNotifications}
    >
      {children}
    </AppShell>
  )
}
