import './styles.css';
import './i18n';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from '@/components/ui/sonner';
import { ApiRequestError, isUnauthorized } from '@/lib/api';
import { queryKeys } from '@/lib/queries';
import { ThemeProvider } from '@/lib/theme';
import { UiProvider } from '@/lib/ui-state';
import { router } from './router';

/**
 * A request refused for lack of session while someone was signed in (expired, signed out elsewhere): ask who is
 * there again, which shows the sign-in page. Not when nobody is signed in (a wrong password, for instance): asking
 * again would reset the sign-in page while it is being filled in.
 */
const onUnauthorized = (error: unknown) => {
  if (isUnauthorized(error) && queryClient.getQueryData(queryKeys.me)) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.me });
  }
};

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.queryKey[0] !== queryKeys.me[0]) onUnauthorized(error);
    },
  }),
  mutationCache: new MutationCache({ onError: onUnauthorized }),
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // No real-time in v1: refresh on tab focus and a light 30 s poll.
      refetchOnWindowFocus: true,
      refetchInterval: 30_000,
      // Client errors (401, 404…) will not change by asking again.
      retry: (count, error) => !(error instanceof ApiRequestError && error.status < 500) && count < 1,
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
