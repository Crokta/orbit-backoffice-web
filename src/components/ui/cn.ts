import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Joins class names, letting later ones win over earlier ones.
 *
 * Plain string concatenation leaves `px-4 px-6` in the DOM and the winner depends on
 * the order Tailwind happened to emit them, not the order they were written. This
 * resolves the conflict predictably, which is what makes a `className` prop on a
 * component safe to expose.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
