import { getArticleDetail } from "@/lib/article";
import { handle, ok, NotFoundError } from "@/lib/api/http";
import { toArticleDetailDTO } from "@/lib/api/serialize";

export const dynamic = "force-dynamic";

/** GET /api/articles/:id — one article, 404 if it does not exist. */
export function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const article = await getArticleDetail(id);
    if (!article) throw new NotFoundError("No article with that id.");
    return ok(toArticleDetailDTO(article));
  })();
}
