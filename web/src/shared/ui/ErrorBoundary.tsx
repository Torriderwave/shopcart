import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Alert, Button, Center, Stack, Text } from '@mantine/core';

/** Último recurso: un error de render no debe dejar la pantalla en blanco. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error de interfaz', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <Center mih="60vh" p="md">
        <Alert color="red" title="Algo salió mal" maw={480}>
          <Stack gap="sm" align="flex-start">
            <Text size="sm">
              Ocurrió un error inesperado en la pantalla. Tus datos no se perdieron; vuelve a
              intentarlo.
            </Text>
            <Button
              size="xs"
              onClick={() => {
                this.setState({ error: null });
                window.location.assign('/');
              }}
            >
              Ir al inicio
            </Button>
          </Stack>
        </Alert>
      </Center>
    );
  }
}
