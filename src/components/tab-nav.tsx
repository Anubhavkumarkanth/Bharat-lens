"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SCOPES } from "@/config/taxonomy";
import { t, type Lang, type UiStringKey } from "@/config/ui-strings";

export function TabNav({ lang }: { lang: Lang }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-0.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-none">
      {SCOPES.map((scope) => {
        const href = `/${scope.id}`;
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={scope.id}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`relative whitespace-nowrap px-3.5 sm:px-4 py-2.5 text-sm transition-colors ${
              active ? "text-foreground font-medium" : "text-muted hover:text-foreground"
            }`}
          >
            {t(`scope.${scope.id}` as UiStringKey, lang)}
            {/* Underline is its own element so it can animate width rather than
                snapping, and so the label doesn't shift when it bolds. */}
            <span
              className={`absolute left-3.5 right-3.5 sm:left-4 sm:right-4 -bottom-px h-0.5 rounded-full bg-accent transition-transform duration-200 origin-left ${
                active ? "scale-x-100" : "scale-x-0"
              }`}
            />
          </Link>
        );
      })}
    </nav>
  );
}
