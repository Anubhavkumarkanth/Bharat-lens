import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listCollections, listSaved, type SavedView } from "@/lib/saved";
import { deleteCollection } from "@/app/saved/actions";
import { getLang } from "@/lib/lang";
import { t, type UiStringKey } from "@/config/ui-strings";
import { CollectionManager } from "@/components/collection-manager";
import { SavedItemCard } from "@/components/saved-item-card";

export const dynamic = "force-dynamic";

const VIEWS: SavedView[] = ["active", "due", "archived"];

export default async function SavedPage(props: PageProps<"/saved">) {
  const lang = await getLang();
  const user = await getCurrentUser();
  if (!user) redirect("/signin");

  const searchParams = await props.searchParams;
  const rawView = typeof searchParams.view === "string" ? searchParams.view : "active";
  const view: SavedView = VIEWS.includes(rawView as SavedView) ? (rawView as SavedView) : "active";
  const collectionId = typeof searchParams.collection === "string" ? searchParams.collection : undefined;

  const [collections, items] = await Promise.all([
    listCollections(user.id),
    listSaved(user.id, { view, collectionId }),
  ]);

  function href(next: { view?: SavedView; collection?: string }) {
    const params = new URLSearchParams();
    params.set("view", next.view ?? view);
    const collection = "collection" in next ? next.collection : collectionId;
    if (collection) params.set("collection", collection);
    return `/saved?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-2xl">{t("saved.title", lang)}</h1>

      <nav className="flex gap-1 border-b border-border">
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={href({ view: v })}
            className={`px-4 py-2 text-sm border-b-2 transition-colors ${
              v === view
                ? "border-accent text-foreground font-medium"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t(`saved.${v}` as UiStringKey, lang)}
          </Link>
        ))}
      </nav>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2 items-center">
          <Link
            href={href({ collection: undefined })}
            className={`px-3 py-1.5 rounded-full text-sm border ${
              !collectionId ? "bg-accent text-white border-accent" : "border-border text-muted hover:text-foreground"
            }`}
          >
            {t("saved.all", lang)}
          </Link>
          {collections.map((c) => (
            <span
              key={c.id}
              className={`inline-flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full text-sm border ${
                collectionId === c.id
                  ? "bg-accent text-white border-accent"
                  : "border-border text-muted"
              }`}
            >
              <Link href={href({ collection: c.id })} className="hover:underline">
                {c.name}
              </Link>
              <form action={deleteCollection}>
                <input type="hidden" name="collectionId" value={c.id} />
                <button
                  type="submit"
                  title={t("saved.deleteCollection", lang)}
                  aria-label={t("saved.deleteCollection", lang)}
                  className="opacity-60 hover:opacity-100"
                >
                  ×
                </button>
              </form>
            </span>
          ))}
        </div>

        <CollectionManager lang={lang} />
      </div>

      {items.length === 0 ? (
        <p className="text-center py-24 text-muted">{t("saved.empty", lang)}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((item) => (
            <SavedItemCard
              key={item.id}
              item={item}
              collections={collections}
              lang={lang}
            />
          ))}
        </div>
      )}
    </div>
  );
}
