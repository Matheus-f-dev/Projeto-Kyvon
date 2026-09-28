import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'

import { ThemeProvider, themeInitScript } from '@/components/theme'
import { TooltipProvider } from '@/components/ui/tooltip'

import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Kyvon OS',
    template: '%s · Kyvon OS',
  },
  description: 'Sistema operacional interno da Kyvon.',
  // Sistema interno: não deve aparecer em buscador algum.
  robots: { index: false, follow: false },
  icons: { icon: '/icon.svg' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfbfc' },
    { media: '(prefers-color-scheme: dark)', color: '#1b1b21' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Define o tema antes da primeira pintura, evitando o flash de tela clara. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <ThemeProvider>
          <TooltipProvider>
            {children}
            <Toaster
              position="bottom-right"
              gap={8}
              toastOptions={{
                classNames: {
                  toast:
                    'group rounded-lg border border-line bg-overlay text-default shadow-[var(--shadow-overlay)] text-sm',
                  title: 'text-strong font-medium text-sm',
                  description: 'text-muted text-xs',
                  actionButton: 'bg-brand text-on-brand rounded px-2 h-6 text-xs font-medium',
                  cancelButton: 'bg-neutral-soft text-muted rounded px-2 h-6 text-xs',
                  error: 'border-danger-border',
                  success: 'border-success-border',
                },
              }}
            />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
