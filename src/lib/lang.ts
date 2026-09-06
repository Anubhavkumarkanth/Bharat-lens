import { cookies } from "next/headers";
import type { Lang } from "@/config/ui-strings";
import { LANG_COOKIE } from "./lang-constants";

export async function getLang(): Promise<Lang> {
  const store = await cookies();
  const value = store.get(LANG_COOKIE)?.value;
  return value === "hi" ? "hi" : "en";
}
