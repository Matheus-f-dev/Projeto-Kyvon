import { z } from 'zod'

/**
 * Valores monetários digitados por pessoas no Brasil.
 *
 * O formulário recebe "48.000,00", "48000", "R$ 1.234,5" ou "1234.56"; o
 * Postgres (`numeric`) só aceita "48000.00". Sem esta normalização, o valor
 * formatado do jeito que qualquer pessoa aqui escreve seria rejeitado pelo
 * banco com um erro genérico.
 *
 * Regra de desambiguação do ponto:
 *   - havendo vírgula, ela é o decimal e todo ponto é separador de milhar;
 *   - sem vírgula, mais de um ponto → milhar ("1.234.567");
 *   - um ponto seguido de exatamente 3 dígitos → milhar ("1.234");
 *   - caso contrário o ponto é decimal ("1234.5").
 */
export function parseMoney(raw: string): string | null {
  let value = raw.replace(/R\$/gi, '').replace(/\s/g, '')
  if (!value) return null

  const negative = value.startsWith('-')
  if (negative) value = value.slice(1)

  if (value.includes(',')) {
    value = value.replace(/\./g, '').replace(',', '.')
  } else {
    const dots = value.split('.').length - 1
    if (dots > 1 || /^\d{1,3}\.\d{3}$/.test(value)) value = value.replace(/\./g, '')
  }

  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null

  const normalized = Number(value).toFixed(2)
  return negative ? `-${normalized}` : normalized
}

/** Valor opcional, sempre positivo (preço, estimativa, total). */
export const optionalMoney = z
  .string()
  .trim()
  .transform((value, context) => {
    if (!value) return undefined
    const parsed = parseMoney(value)
    if (parsed === null || parsed.startsWith('-')) {
      context.addIssue({ code: 'custom', message: 'Valor inválido. Use o formato 1.234,56.' })
      return z.NEVER
    }
    return parsed
  })
  .optional()

/** Delta opcional que pode ser negativo (aditivo que reduz o valor). */
export const optionalSignedMoney = z
  .string()
  .trim()
  .transform((value, context) => {
    if (!value) return undefined
    const parsed = parseMoney(value)
    if (parsed === null) {
      context.addIssue({ code: 'custom', message: 'Valor inválido. Use o formato 1.234,56.' })
      return z.NEVER
    }
    return parsed
  })
  .optional()
