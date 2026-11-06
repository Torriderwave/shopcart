import type { ReactNode } from 'react';
import { Group, Stack, Text, Title } from '@mantine/core';

export function PageHeader({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
}) {
  return (
    <Group justify="space-between" align="flex-start" mb="lg" wrap="wrap">
      <Stack gap={2}>
        <Title order={2}>{titulo}</Title>
        {descripcion && (
          <Text c="dimmed" size="sm">
            {descripcion}
          </Text>
        )}
      </Stack>
      {acciones}
    </Group>
  );
}
