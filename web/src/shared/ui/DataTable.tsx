import type { ReactNode } from 'react';
import { Group, Pagination, Table, Text, UnstyledButton } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconArrowsSort } from '@tabler/icons-react';
import type { PaginationMeta } from '@shopcart/contracts';

export interface Column<T> {
  key: string;
  header: string;
  /** Campo de la lista blanca del backend; si existe, la columna es ordenable. */
  sort?: string;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => ReactNode;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  meta,
  sort,
  onSort,
  onPage,
  onRowClick,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  meta?: PaginationMeta;
  /** "campo:asc" | "campo:desc" */
  sort?: string;
  onSort?: (next: string) => void;
  onPage?: (page: number) => void;
  onRowClick?: (row: T) => void;
}) {
  const [campo, dir] = (sort ?? '').split(':');
  const pages = meta ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;

  return (
    <>
      <div className="tabla-card">
        <Table.ScrollContainer minWidth={640}>
          <Table highlightOnHover={!!onRowClick} verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                {columns.map((c) => (
                  <Table.Th
                    key={c.key}
                    ta={c.align ?? 'left'}
                    aria-sort={
                      c.sort && c.sort === campo
                        ? dir === 'desc'
                          ? 'descending'
                          : 'ascending'
                        : undefined
                    }
                  >
                    {c.sort && onSort ? (
                      <UnstyledButton
                        fw={600}
                        fz="sm"
                        onClick={() =>
                          onSort(`${c.sort}:${c.sort === campo && dir === 'asc' ? 'desc' : 'asc'}`)
                        }
                      >
                        <Group
                          gap={4}
                          wrap="nowrap"
                          justify={c.align === 'right' ? 'flex-end' : 'flex-start'}
                        >
                          {c.header}
                          {c.sort === campo ? (
                            dir === 'desc' ? (
                              <IconArrowDown size={14} />
                            ) : (
                              <IconArrowUp size={14} />
                            )
                          ) : (
                            <IconArrowsSort size={14} opacity={0.4} />
                          )}
                        </Group>
                      </UnstyledButton>
                    ) : (
                      c.header
                    )}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row) => (
                <Table.Tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={onRowClick ? { cursor: 'pointer' } : undefined}
                >
                  {columns.map((c) => (
                    <Table.Td key={c.key} ta={c.align ?? 'left'}>
                      {c.render(row)}
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </div>
      {meta && (
        <Group justify="space-between" mt="md" wrap="wrap">
          <Text size="sm" c="dimmed">
            {meta.total} {meta.total === 1 ? 'resultado' : 'resultados'}
          </Text>
          {pages > 1 && (
            <Pagination total={pages} value={meta.page} onChange={onPage} size="sm" withEdges />
          )}
        </Group>
      )}
    </>
  );
}
