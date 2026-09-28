import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { Logo } from '@/components/layout/sidebar'
import { getAuthContext } from '@/server/auth/context'

import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Entrar' }
export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>
}) {
  const context = await getAuthContext()
  if (context) redirect('/dashboard')

  const params = await searchParams
  const redirectTo = params.redirectTo ?? '/dashboard'

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,460px)]">
      {/* Painel de apresentação: some no mobile, onde só o formulário importa. */}
      <section className="bg-base relative hidden flex-col justify-between overflow-hidden p-10 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 18% 12%, var(--brand-soft) 0%, transparent 42%), radial-gradient(circle at 78% 78%, var(--accent-soft) 0%, transparent 46%)',
          }}
          aria-hidden
        />

        <div className="relative flex items-center gap-2.5">
          <Logo className="size-7" />
          <span className="text-strong text-base font-semibold tracking-tight">Kyvon OS</span>
        </div>

        <div className="relative flex max-w-md flex-col gap-4">
          <h1 className="text-strong text-2xl leading-tight font-semibold">
            O centro operacional da Kyvon.
          </h1>
          <p className="text-muted text-sm leading-relaxed">
            Do primeiro contato ao suporte pós-lançamento, tudo conectado em uma cadeia só: cliente,
            contrato, projeto, tarefas, aprovações.
          </p>

          <dl className="border-line mt-3 grid grid-cols-2 gap-x-6 gap-y-4 border-t pt-5">
            {[
              ['Comercial', 'Pipeline, propostas e conversão em contrato'],
              ['Projetos', 'Etapas, tarefas e progresso em tempo real'],
              ['Aprovações', 'Versões preservadas, decisões registradas'],
              ['Suporte', 'Chamados ligados ao projeto de origem'],
            ].map(([term, description]) => (
              <div key={term} className="flex flex-col gap-0.5">
                <dt className="text-strong text-xs font-medium">{term}</dt>
                <dd className="text-2xs text-muted leading-relaxed">{description}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-2xs text-subtle relative">
          Acesso restrito à equipe Kyvon. Todas as ações são registradas.
        </p>
      </section>

      <section className="bg-sunken flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col gap-1.5">
            <div className="mb-4 flex items-center gap-2.5 lg:hidden">
              <Logo className="size-7" />
              <span className="text-strong text-base font-semibold tracking-tight">Kyvon OS</span>
            </div>
            <h2 className="text-strong text-xl font-semibold">Entrar</h2>
            <p className="text-muted text-sm">Use suas credenciais da Kyvon.</p>
          </div>

          <LoginForm redirectTo={redirectTo} />

          <p className="text-2xs text-subtle mt-8 leading-relaxed">
            Esqueceu a senha? Peça a um administrador para redefini-la em Configurações → Usuários.
          </p>
        </div>
      </section>
    </main>
  )
}
