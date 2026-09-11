import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfileByHandle, listReposts } from "@/lib/profiles";
import { getLang } from "@/lib/lang";
import { t, type UiStringKey } from "@/config/ui-strings";

// Public: readable signed out, and by anyone with the link.
export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/u/[handle]">): Promise<Metadata> {
  const { handle } = await props.params;
  const profile = await getProfileByHandle(handle);
  if (!profile) return {};

  const name = profile.displayName ?? `@${profile.handle}`;
  return {
    title: `${name} — Bharat Lens`,
    description: profile.bio ?? `Stories reposted by ${name} on Bharat Lens.`,
  };
}

export default async function ProfilePage(props: PageProps<"/u/[handle]">) {
  const { handle } = await props.params;
  const profile = await getProfileByHandle(handle);
  if (!profile) notFound();

  const lang = await getLang();
  const items = await listReposts(profile.userId);

  return (
    <div className="max-w-2xl mx-auto animate-rise">
      <header className="mb-10">
        <h1 className="font-serif text-3xl mb-1">{profile.displayName ?? `@${profile.handle}`}</h1>
        <p className="text-sm text-muted">@{profile.handle}</p>

        {profile.bio && <p className="mt-4 text-foreground/85 leading-relaxed">{profile.bio}</p>}

        {(profile.instagramUrl || profile.xUrl) && (
          <div className="mt-5 flex gap-3 text-sm">
            {profile.instagramUrl && (
              <a
                href={profile.instagramUrl}
                target="_blank"
                rel="noopener noreferrer me"
                className="rounded-full border border-border px-3.5 py-1.5 text-muted hover:text-foreground hover:border-border-strong transition-colors"
              >
                {t("profile.instagram", lang)} ↗
              </a>
            )}
            {profile.xUrl && (
              <a
                href={profile.xUrl}
                target="_blank"
                rel="noopener noreferrer me"
                className="rounded-full border border-border px-3.5 py-1.5 text-muted hover:text-foreground hover:border-border-strong transition-colors"
              >
                {t("profile.x", lang)} ↗
              </a>
            )}
          </div>
        )}
      </header>

      <h2 className="text-xs uppercase tracking-wider text-muted mb-4">
        {t("profile.reposts", lang)} · {items.length}
      </h2>

      {items.length === 0 ? (
        <p className="text-muted py-12 text-center">{t("profile.noReposts", lang)}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((item, index) => {
            const categoryLabel = t(`category.${item.category}` as UiStringKey, lang);
            return (
              <article
                key={item.id}
                className="rounded-2xl border border-border bg-surface p-5 shadow-card transition-all duration-300 hover:shadow-lift hover:-translate-y-0.5 animate-rise"
                style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
              >
                <div className="flex items-center gap-2 text-xs text-muted mb-2 flex-wrap">
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 uppercase tracking-wider font-medium text-accent">
                    {categoryLabel}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{item.sourceName}</span>
                </div>

                <h3 className="font-serif text-lg leading-snug">
                  <Link href={`/article/${item.articleId}`} className="hover:text-accent transition-colors">
                    {item.title}
                  </Link>
                </h3>

                {item.comment && (
                  <p className="mt-2 text-sm text-foreground/80 border-l-2 border-border pl-3">
                    {item.comment}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
