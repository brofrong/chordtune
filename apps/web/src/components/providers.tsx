'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthSheetProvider } from '@/features/auth/auth-sheet';
import { makeQueryClient, makeTRPCClient, TRPCProvider } from '@/lib/trpc';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  const [trpcClient] = useState(makeTRPCClient);

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <TooltipProvider>
          <AuthSheetProvider>{children}</AuthSheetProvider>
        </TooltipProvider>
      </TRPCProvider>
    </QueryClientProvider>
  );
}
