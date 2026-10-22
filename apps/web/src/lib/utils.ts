import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** دمج أصناف Tailwind بأمان (نمط shadcn). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
