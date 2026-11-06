import { Group, Pagination, Text } from '@mantine/core';
import type { PaginationMeta } from '@shopcart/contracts';

export function DataTableFooterPagination({
  meta,
  onPage,
}: {
  meta: PaginationMeta;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(meta.total / meta.pageSize));
  return (
    <Group justify="space-between" mt="lg" wrap="wrap">
      <Text size="sm" c="dimmed">
        {meta.total} {meta.total === 1 ? 'resultado' : 'resultados'}
      </Text>
      {pages > 1 && <Pagination total={pages} value={meta.page} onChange={onPage} withEdges />}
    </Group>
  );
}
