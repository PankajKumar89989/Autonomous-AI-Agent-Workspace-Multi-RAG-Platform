"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import Toaster from "@/components/Toaster";
import { restoreSession } from "@/lib/auth";
import { useThemeStore } from "@/store/theme";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }));
  const initTheme = useThemeStore((s) => s.init);

  useEffect(() => {
    initTheme();
    void restoreSession();
  }, [initTheme]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
