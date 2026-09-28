/**
 * Política de arquivos — compartilhada entre servidor e interface.
 *
 * A interface usa esta lista só para orientar (atributo `accept`, mensagem de
 * erro antes do envio). Quem decide é o servidor, que confere extensão **e**
 * assinatura binária: o MIME enviado pelo navegador é ignorado.
 */

export const FILE_TARGETS = [
  'client',
  'proposal',
  'contract',
  'contract_addendum',
  'project',
  'task',
  'approval_version',
  'scope_change',
  'support_ticket',
  'marketing_content',
  'case',
] as const

export type FileTarget = (typeof FILE_TARGETS)[number]

export interface FileTargetRef {
  type: FileTarget
  id: string
}

/** Como a assinatura do conteúdo é conferida. */
export type FileSignature =
  | 'pdf'
  | 'png'
  | 'jpeg'
  | 'gif'
  | 'webp'
  | 'zip'
  | 'ole'
  | 'mp4'
  | 'webm'
  | 'psd'
  | 'postscript'
  | 'text'
  | 'svg'

export interface FileKind {
  mime: string
  signature: FileSignature
  /** Pode ser exibido no navegador (imagem raster e PDF). SVG nunca: pode carregar script. */
  inline: boolean
  label: string
}

export const ALLOWED_FILE_TYPES: Record<string, FileKind> = {
  pdf: { mime: 'application/pdf', signature: 'pdf', inline: true, label: 'PDF' },

  png: { mime: 'image/png', signature: 'png', inline: true, label: 'Imagem' },
  jpg: { mime: 'image/jpeg', signature: 'jpeg', inline: true, label: 'Imagem' },
  jpeg: { mime: 'image/jpeg', signature: 'jpeg', inline: true, label: 'Imagem' },
  gif: { mime: 'image/gif', signature: 'gif', inline: true, label: 'Imagem' },
  webp: { mime: 'image/webp', signature: 'webp', inline: true, label: 'Imagem' },
  svg: { mime: 'image/svg+xml', signature: 'svg', inline: false, label: 'Vetor' },

  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    signature: 'zip',
    inline: false,
    label: 'Documento',
  },
  xlsx: {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    signature: 'zip',
    inline: false,
    label: 'Planilha',
  },
  pptx: {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    signature: 'zip',
    inline: false,
    label: 'Apresentação',
  },
  doc: { mime: 'application/msword', signature: 'ole', inline: false, label: 'Documento' },
  xls: { mime: 'application/vnd.ms-excel', signature: 'ole', inline: false, label: 'Planilha' },
  ppt: {
    mime: 'application/vnd.ms-powerpoint',
    signature: 'ole',
    inline: false,
    label: 'Apresentação',
  },
  zip: { mime: 'application/zip', signature: 'zip', inline: false, label: 'Compactado' },

  txt: { mime: 'text/plain', signature: 'text', inline: false, label: 'Texto' },
  md: { mime: 'text/markdown', signature: 'text', inline: false, label: 'Texto' },
  csv: { mime: 'text/csv', signature: 'text', inline: false, label: 'Planilha' },

  mp4: { mime: 'video/mp4', signature: 'mp4', inline: false, label: 'Vídeo' },
  mov: { mime: 'video/quicktime', signature: 'mp4', inline: false, label: 'Vídeo' },
  webm: { mime: 'video/webm', signature: 'webm', inline: false, label: 'Vídeo' },

  psd: { mime: 'image/vnd.adobe.photoshop', signature: 'psd', inline: false, label: 'Photoshop' },
  ai: {
    mime: 'application/postscript',
    signature: 'postscript',
    inline: false,
    label: 'Illustrator',
  },
}

export const FILE_ACCEPT_ATTRIBUTE = Object.keys(ALLOWED_FILE_TYPES)
  .map((extension) => `.${extension}`)
  .join(',')

export function fileExtension(name: string): string {
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(index + 1).toLowerCase() : ''
}

export function fileKindFor(name: string): FileKind | undefined {
  return ALLOWED_FILE_TYPES[fileExtension(name)]
}
