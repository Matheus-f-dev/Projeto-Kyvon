import { redirect } from 'next/navigation'

/** A raiz não tem conteúdo próprio: o ponto de entrada real é o dashboard. */
export default function RootPage() {
  redirect('/dashboard')
}
