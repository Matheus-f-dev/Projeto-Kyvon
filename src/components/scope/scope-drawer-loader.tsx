import type { AuthContext } from '@/server/auth/context'
import { getScopeChangeDetail } from '@/server/modules/scope/queries'
import { isInvolvedInProject } from '@/server/modules/tasks/service'

import { MissingScopeDrawer, ScopeDrawer } from './scope-drawer'

/**
 * Carrega o drawer de mudança de escopo (`?escopo=`), com as permissões
 * calculadas pelas mesmas regras de `scope/actions.ts`.
 */
export async function ScopeDrawerLoader({
  context,
  scopeChangeId,
}: {
  context: AuthContext
  scopeChangeId: string
}) {
  const change = await getScopeChangeDetail(context, scopeChangeId)
  if (!change) return <MissingScopeDrawer />

  const involved =
    context.can('projects.write') && !context.can('projects.delete')
      ? await isInvolvedInProject(change.project.id, context.user.id)
      : true

  return (
    <ScopeDrawer
      change={change}
      permissions={{
        canWrite: context.can('scope.write'),
        canDecide: context.can('scope.decide'),
        canEditProject: context.can('projects.write') && involved,
        canGenerateAddendum: context.can('contracts.write') && context.can('contracts.values.read'),
      }}
    />
  )
}
