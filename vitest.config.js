import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // 允许空的 describe 块（骨架测试文件）
    passWithNoTests: false,
  },
});
