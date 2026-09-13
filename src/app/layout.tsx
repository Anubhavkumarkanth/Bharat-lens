import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TabNav } from "@/components/tab-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { SearchBox } from "@/components/search-box";
import { getLang } from "@/lib/lang";
import { t } from "@/config/ui-strings";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bharat Lens — India-first news intelligence",
  description: "One dashboard for India, India abroad, impact-on-India, and world news — grounded summaries, zero noise.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await getLang();

  return (
    <html
      lang={lang}
      suppressHydrationWarning
      className={`${geistSans.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {/* Sticky so the scopes stay reachable during a long scroll; the blur
              keeps the feed visible behind it rather than cutting it off. */}
          <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
              <Link
                href="/india"
                className="font-serif text-xl font-semibold tracking-tight hover:text-accent transition-colors"
              >
                {t("site.title", lang)}
              </Link>
              <div className="flex items-center gap-2 sm:gap-3">
                <SearchBox lang={lang} />
                <Link
                  href="/saved"
                  className="text-sm text-muted hover:text-foreground transition-colors"
                >
                  {t("nav.saved", lang)}
                </Link>
                <Link
                  href="/preferences"
                  className="text-sm text-muted hover:text-foreground transition-colors"
                >
                  {t("nav.preferences", lang)}
                </Link>
                <LanguageToggle lang={lang} />
                <ThemeToggle />
              </div>
            </div>
            <div className="max-w-6xl mx-auto px-4 sm:px-6">
              <TabNav lang={lang} />
            </div>
          </header>

          <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-8">{children}</main>

          <footer className="border-t border-border mt-12">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 text-sm text-muted">
              {t("site.tagline", lang)}
            </div>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
