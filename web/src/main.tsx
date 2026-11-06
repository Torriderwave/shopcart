import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { MotionConfig } from 'motion/react';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/inter';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/charts/styles.css';
import './styles.css';
import { theme } from './theme';
import ClickSpark from './components/reactbits/ClickSpark';
import { configurarZodEs } from '@shopcart/contracts';
import App from './App';
import { ApiError } from './shared/api/client';
import { SessionProvider } from './shared/auth/session';
import { ErrorBoundary } from './shared/ui/ErrorBoundary';

configurarZodEs();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      // Los errores del servidor (4xx) no se reintentan; solo los de red.
      retry: (n, err) => err instanceof ApiError && err.code === 'RED' && n < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <MantineProvider theme={theme}>
        <Notifications position="top-center" autoClose={4000} />
        <QueryClientProvider client={queryClient}>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <SessionProvider>
              <ErrorBoundary>
                <ClickSpark sparkColor="#12a784" sparkCount={9} sparkRadius={22}>
                  <App />
                </ClickSpark>
              </ErrorBoundary>
            </SessionProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </MantineProvider>
    </MotionConfig>
  </StrictMode>,
);
