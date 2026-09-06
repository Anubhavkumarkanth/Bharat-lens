"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SCOPES } from "@/config/taxonomy";
import { t, type Lang, type UiStringKey } from "@/config/ui-strings";

export function TabNav({ lang }: { lang: Lang }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      {SCOPES.map((scope) => {
        const href = `/${scope.id}`;
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={scope.id}
            href={href}
            className={`whitespace-nowrap px-4 py-2 text-sm border-b-2 transition-colors ${
              active
                ? "border-accent text-foreground font-medium"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t(`scope.${scope.id}` as UiStringKey, lang)}
          </Link>
        );
      })}
    </nav>
  );
}
