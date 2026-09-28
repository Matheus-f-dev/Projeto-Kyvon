/**
 * Canal para abrir o command palette de qualquer lugar.
 *
 * Um evento de DOM em vez de contexto React: o palette vive no layout e os
 * gatilhos ficam espalhados (cabeçalho, menu de conta, estados vazios).
 * Um contexto obrigaria todos eles a serem descendentes de um provider, o que
 * não vale a amarração para um único booleano.
 */

const EVENT_NAME = 'kyvon:command-palette'

export function openCommandPalette(): void {
  document.dispatchEvent(new CustomEvent(EVENT_NAME))
}

export function onOpenCommandPalette(handler: () => void): () => void {
  document.addEventListener(EVENT_NAME, handler)
  return () => document.removeEventListener(EVENT_NAME, handler)
}
