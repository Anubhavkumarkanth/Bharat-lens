import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TabNav } from "@/components/tab-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
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
          <header className="border-b border-border">
            <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
              <Link href="/india" className="font-serif text-xl font-semibold tracking-tight">
                {t("site.title", lang)}
              </Link>
              <div className="flex items-center gap-3">
                <LanguageToggle lang={lang} />
                <ThemeToggle />
              </div>
            </div>
            <div className="max-w-5xl mx-auto px-4">
              <TabNav lang={lang} />
            </div>
          </header>
          <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">{children}</main>
          <footer className="border-t border-border">
            <div className="max-w-5xl mx-auto px-4 py-6 text-sm text-muted">
              {t("site.tagline", lang)}
            </div>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
