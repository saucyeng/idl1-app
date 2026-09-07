/** Shared prose styling for the four how-to articles (UI-7: `settings.css`'s
 *  `.idl1-settings__howto` re-expressed with tokens). Prose is Plex Sans
 *  (UI-DIRECTION decision 34); headings and inline code stay mono as chrome
 *  elements within it. Applied to each article's root element via
 *  arbitrary-variant child selectors rather than a component wrapper, since
 *  every article renders plain semantic HTML (`h3`/`h4`/`p`/`ul`/`table`)
 *  that Tailwind's preflight otherwise strips bare. */
export const HOWTO_ARTICLE_CLASSES =
  "flex flex-col gap-3 border-l border-rule pl-4 font-sans text-sm leading-relaxed text-fg " +
  "[&_h3]:font-mono [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:uppercase [&_h3]:tracking-[var(--tracking-label)] [&_h3]:text-fg-dim " +
  "[&_h4]:font-sans [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:text-fg [&_h4]:mt-1 " +
  "[&_ul]:list-disc [&_ul]:pl-5 [&_li]:leading-relaxed " +
  "[&_table]:w-full [&_table]:border-collapse [&_table]:font-mono [&_table]:text-xs " +
  "[&_th]:border-b [&_th]:border-rule [&_th]:pb-1 [&_th]:text-left [&_th]:text-fg-dim " +
  "[&_td]:border-b [&_td]:border-rule [&_td]:py-1 [&_td]:align-top " +
  "[&_code]:rounded-[var(--radius-structural)] [&_code]:bg-control [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_code]:text-fg";
