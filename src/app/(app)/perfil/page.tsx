import type { Metadata } from 'next'

import { PageContainer, PageHeader } from '@/components/layout/page'
import {
  ChangePasswordForm,
  ProfileForm,
  RevokeSessionsButton,
} from '@/components/settings/profile-forms'
import { Avatar } from '@/components/ui/avatar'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/panel'
import { requireAuth } from '@/server/auth/context'
import { getAdminUser } from '@/server/modules/admin/queries'

export const metadata: Metadata = { title: 'Meu perfil' }
export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const context = await requireAuth()
  // Os dados completos (telefone) vêm da mesma consulta da administração; a
  // página é da própria pessoa, então não exige `users.read`.
  const user = await getAdminUser(context.user.id)

  return (
    <PageContainer className="flex flex-col gap-5">
      <PageHeader title="Meu perfil" description="Seus dados, sua senha e suas sessões." />

      <Panel>
        <PanelBody className="flex items-center gap-3">
          <Avatar name={context.user.name} src={context.user.avatarUrl} size="xl" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-strong text-base font-semibold">{context.user.name}</span>
            <span className="text-muted truncate text-sm">{context.user.email}</span>
            <span className="text-2xs text-subtle">
              Perfil {context.user.roleName} · {context.permissions.size} permissões
            </span>
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Dados pessoais"
          description="O e-mail de acesso é alterado por um administrador."
        />
        <ProfileForm
          defaults={{
            name: context.user.name,
            jobTitle: context.user.jobTitle,
            phone: user?.phone ?? null,
          }}
        />
      </Panel>

      <Panel>
        <PanelHeader title="Senha" />
        <ChangePasswordForm />
      </Panel>

      <Panel>
        <PanelHeader
          title="Sessões"
          description="Saia de todos os outros navegadores e dispositivos. Esta sessão continua aberta."
          actions={<RevokeSessionsButton />}
        />
      </Panel>
    </PageContainer>
  )
}
