import type { AuthContext } from '@/server/auth/context'
import { getFilePanel } from '@/server/modules/files/queries'
import { getProjectDetail } from '@/server/modules/projects/queries'
import { getTaskDetail, listDependencyCandidates } from '@/server/modules/tasks/queries'
import { isInvolvedInTask } from '@/server/modules/tasks/service'
import { listUserOptions } from '@/server/modules/users/queries'

import { MissingTaskDrawer, TaskDrawer } from './task-drawer'

/**
 * Carrega e renderiza o drawer de tarefa no servidor.
 *
 * Qualquer página que aceite `?tarefa=` usa este componente — o dado chega
 * pronto na primeira renderização, sem um fetch a mais do cliente. As
 * permissões são calculadas aqui, com as mesmas regras que as actions impõem.
 */
export async function TaskDrawerLoader({
  context,
  taskId,
}: {
  context: AuthContext
  taskId: string
}) {
  const task = await getTaskDetail(context, taskId)
  if (!task) return <MissingTaskDrawer />

  const [users, project, candidates, involved, filePanel] = await Promise.all([
    listUserOptions(),
    getProjectDetail(context, task.project.id),
    listDependencyCandidates(task.id, task.project.id),
    isInvolvedInTask(task.id, context.user.id),
    getFilePanel(context, { type: 'task', id: task.id }),
  ])

  // Um responsável suspenso some da lista de ativos — mas precisa continuar
  // como opção, senão salvar a tarefa o desatribuiria sem ninguém pedir.
  const options =
    task.assignee && !users.some((user) => user.id === task.assignee?.id)
      ? [...users, { id: task.assignee.id, name: `${task.assignee.name} (inativo)` }]
      : users

  const canManageAll = context.can('tasks.delete')

  return (
    <TaskDrawer
      task={task}
      users={options}
      stages={(project?.stages ?? []).map((stage) => ({ id: stage.id, name: stage.name }))}
      dependencyCandidates={candidates}
      currentUserId={context.user.id}
      filePanel={filePanel}
      permissions={{
        canEdit: context.can('tasks.write') && (canManageAll || involved),
        canAssign: context.can('tasks.assign'),
        canDelete: canManageAll,
        canComment: context.can('tasks.write'),
      }}
    />
  )
}
