import { useState } from 'react';
import { Badge, Button, Card, Group, Modal, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import type { Direccion } from '@shopcart/contracts';
import { notifyError, notifyOk } from '../../shared/notify';
import { ConfirmButton } from '../../shared/ui/ConfirmButton';
import { Estados, Vacio } from '../../shared/ui/Estados';
import { PageHeader } from '../../shared/ui/PageHeader';
import { DireccionForm, useDireccionMutations, useDirecciones } from './addresses';

export function DireccionTarjeta({ d }: { d: Direccion }) {
  return (
    <Stack gap={2}>
      <Group gap="xs">
        <Text fw={600}>{d.alias}</Text>
        {d.esPrincipal && (
          <Badge size="sm" variant="light">
            Principal
          </Badge>
        )}
      </Group>
      <Text size="sm">{d.destinatario}</Text>
      <Text size="sm" c="dimmed">
        {d.linea1}
        {d.linea2 ? `, ${d.linea2}` : ''}
      </Text>
      <Text size="sm" c="dimmed">
        {d.ciudad}, {d.departamento}
        {d.codigoPostal ? ` · ${d.codigoPostal}` : ''}
      </Text>
      <Text size="sm" c="dimmed">
        Tel. {d.telefono}
      </Text>
    </Stack>
  );
}

export default function AddressesPage() {
  const direcciones = useDirecciones();
  const m = useDireccionMutations();
  const [editando, setEditando] = useState<Direccion | 'nueva' | null>(null);

  return (
    <>
      <PageHeader
        titulo="Mis direcciones"
        descripcion="Direcciones de entrega para tus pedidos."
        acciones={
          <Button leftSection={<IconPlus size={16} />} onClick={() => setEditando('nueva')}>
            Nueva dirección
          </Button>
        }
      />
      <Estados
        query={direcciones}
        esVacio={(d) => d.length === 0}
        vacio={
          <Vacio
            titulo="Aún no tienes direcciones"
            descripcion="Agrega una para poder pagar tus pedidos."
            accion={<Button onClick={() => setEditando('nueva')}>Agregar dirección</Button>}
          />
        }
      >
        {(lista) => (
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            {lista.map((d) => (
              <Card key={d.idDireccion} withBorder padding="md" radius="md">
                <DireccionTarjeta d={d} />
                <Group mt="md" gap="xs">
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconPencil size={14} />}
                    onClick={() => setEditando(d)}
                  >
                    Editar
                  </Button>
                  <ConfirmButton
                    size="xs"
                    color="red"
                    variant="subtle"
                    leftSection={<IconTrash size={14} />}
                    titulo="Eliminar dirección"
                    mensaje={`¿Eliminar la dirección «${d.alias}»? Tus pedidos anteriores conservan la dirección con la que se enviaron.`}
                    etiquetaConfirmar="Eliminar"
                    onConfirm={() =>
                      m.eliminar.mutateAsync(d.idDireccion).then(
                        () => notifyOk('Dirección eliminada.'),
                        (e) => notifyError(e),
                      )
                    }
                  >
                    Eliminar
                  </ConfirmButton>
                </Group>
              </Card>
            ))}
          </SimpleGrid>
        )}
      </Estados>

      <Modal
        opened={editando !== null}
        onClose={() => setEditando(null)}
        title={editando === 'nueva' ? 'Nueva dirección' : 'Editar dirección'}
        size="lg"
        centered
      >
        {editando && (
          <DireccionForm
            key={editando === 'nueva' ? 'nueva' : editando.idDireccion}
            inicial={editando === 'nueva' ? undefined : editando}
            enviando={m.crear.isPending || m.actualizar.isPending}
            onCancel={() => setEditando(null)}
            onSubmit={async (d) => {
              if (editando === 'nueva') await m.crear.mutateAsync(d);
              else await m.actualizar.mutateAsync({ id: editando.idDireccion, d });
              notifyOk('Dirección guardada.');
              setEditando(null);
            }}
          />
        )}
      </Modal>
    </>
  );
}
