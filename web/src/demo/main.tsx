/* Punto de entrada de la demo estática. Solo lo referencia web/demo/index.html (build:demo);
   el main.tsx de producción no lo importa, así que no entra en el bundle de producción. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { MotionConfig } from 'motion/react';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/inter';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/charts/styles.css';
import '../styles.css';
import './demo.css';
import { theme } from '../theme';
import ClickSpark from '../components/reactbits/ClickSpark';
import { configurarZodEs } from '@shopcart/contracts';
import App from '../App';
import { ApiError } from '../shared/api/client';
import { SessionProvider } from '../shared/auth/session';
import { ErrorBoundary } from '../shared/ui/ErrorBoundary';
import { instalarDemo } from './install';
import { DemoBanner } from './DemoBanner';

configurarZodEs();
// Antes de montar nada: el estado del día y el `fetch` simulado deben estar listos.
instalarDemo();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
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
          <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <SessionProvider>
              <ErrorBoundary>
                <ClickSpark sparkColor="#12a784" sparkCount={9} sparkRadius={22}>
                  <App />
                </ClickSpark>
              </ErrorBoundary>
            </SessionProvider>
            <DemoBanner />
          </HashRouter>
        </QueryClientProvider>
      </MantineProvider>
    </MotionConfig>
  </StrictMode>,
);
