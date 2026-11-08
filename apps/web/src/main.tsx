import './styles.css';
import './i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/lib/theme';
import { UiProvider } from '@/lib/ui-state';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // No real-time in v1: refresh on tab focus and a light 30 s poll.
      refetchOnWindowFocus: true,
      refetchInterval: 30_000,
      retry: 1,
    },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <UiProvider>
          <RouterProvider router={router} />
          <Toaster />
        </UiProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
