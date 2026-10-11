import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";

import "./globals.css";
import Providers from "@/components/Providers";

const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "AI Agent Workspace",
  description: "Autonomous AI agents and multi-RAG platform",
  icons: { icon: "/favicon.svg" },
};

// Runs before first paint so the saved theme never flashes.
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${plex.variable} min-h-screen bg-stone-50 font-sans text-stone-900 antialiased dark:bg-stone-950 dark:text-stone-100`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
