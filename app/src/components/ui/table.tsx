"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/** Dense idl0-style table: 6 px row rhythm (`--row-rhythm`) and a reserved
 *  3 px inset selection bar on every row (a permanent `border-left`, so its
 *  width never shifts layout — transparent when unselected, `--good` when
 *  selected). */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full border-collapse font-mono text-sm text-fg", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("border-b border-rule [&_tr]:border-b-0", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t border-rule bg-surface-2 font-medium", className)}
      {...props}
    />
  )
}

function TableRow({
  className,
  selected = false,
  ...props
}: React.ComponentProps<"tr"> & {
  /** Reserves the 3 px inset bar in `--good`; unselected rows keep the
   *  same 3 px transparent border so selection never shifts layout. */
  selected?: boolean
}) {
  return (
    <tr
      data-slot="table-row"
      data-selected={selected}
      className={cn(
        "border-b border-rule border-l-[3px] border-l-transparent transition-colors hover:bg-surface-2 data-[selected=true]:bg-surface-2 data-[selected=true]:border-l-good",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "px-2 py-[var(--row-rhythm)] text-left align-middle font-medium whitespace-nowrap text-fg-dim [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-2 py-1.5 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-fg-dim", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
