import { ValidationError } from '@/server/errors'
import { fileExtension, fileKindFor, type FileKind, type FileSignature } from '@/shared/files'

/**
 * Validação do conteúdo enviado.
 *
 * Extensão sozinha não prova nada: um `.pdf` pode ser um HTML com script. Por
 * isso cada tipo aceito tem uma assinatura binária conferida aqui, e o MIME
 * gravado é o da nossa tabela — nunca o que o navegador declarou.
 */

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte)

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end))

const CHECKS: Record<FileSignature, (bytes: Uint8Array) => boolean> = {
  pdf: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]),
  png: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  jpeg: (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  gif: (b) => ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a',
  webp: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP',
  zip: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06]),
  ole: (b) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  mp4: (b) => ascii(b, 4, 8) === 'ftyp',
  webm: (b) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]),
  psd: (b) => ascii(b, 0, 4) === '8BPS',
  // Arquivos do Illustrator modernos são PDFs; os antigos, PostScript.
  postscript: (b) => ascii(b, 0, 4) === '%PDF' || ascii(b, 0, 4) === '%!PS',
  text: (b) => isText(b),
  svg: (b) => isText(b) && /<svg[\s>]/i.test(new TextDecoder().decode(b.subarray(0, 4096))),
}

/** Texto não tem byte nulo — é o critério mais simples que separa texto de binário. */
function isText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 8192)
  return !sample.includes(0)
}

/**
 * Nome exibido: sem diretórios (alguns navegadores antigos enviam o caminho
 * completo), sem caracteres de controle, com tamanho limitado.
 * Nunca é usado para montar caminho no storage.
 */
export function sanitizeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? ''
  const clean = base
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean || clean === '.' || clean === '..') return 'arquivo'
  if (clean.length <= 200) return clean

  const extension = fileExtension(clean)
  const stem = clean.slice(0, 200 - extension.length - 1)
  return extension ? `${stem}.${extension}` : stem
}

export function validateUpload(input: { name: string; bytes: Uint8Array; maxBytes: number }): {
  name: string
  extension: string
  kind: FileKind
} {
  const name = sanitizeFileName(input.name)
  const extension = fileExtension(name)
  const kind = fileKindFor(name)

  if (!kind) {
    throw new ValidationError(
      `Tipo de arquivo não permitido${extension ? ` (.${extension})` : ''}.`,
    )
  }

  if (input.bytes.byteLength === 0) {
    throw new ValidationError('O arquivo está vazio.')
  }

  if (input.bytes.byteLength > input.maxBytes) {
    throw new ValidationError(
      `O arquivo passa do limite de ${Math.round(input.maxBytes / (1024 * 1024))} MB.`,
    )
  }

  if (!CHECKS[kind.signature](input.bytes)) {
    throw new ValidationError(`O conteúdo não corresponde a um arquivo .${extension} válido.`)
  }

  return { name, extension, kind }
}
