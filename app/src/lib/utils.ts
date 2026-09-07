import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merges class names, resolving conflicting Tailwind utility classes
 *  (shadcn/ui's standard `cn` helper: `clsx` then `tailwind-merge`). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
