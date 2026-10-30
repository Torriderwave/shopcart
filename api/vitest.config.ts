import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Los tests de integración comparten una única BD: se ejecutan en serie.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
