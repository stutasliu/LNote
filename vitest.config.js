/* =========================================================
 * vitest.config.js —— 测试配置（独立于 vite.config.js）
 *
 * 不加载 vite-plugin-inkpad：单元测试直接从 src-app 源码提取
 * 纯函数，无需拼接产物；E2E 由测试自身启动静态服务器与浏览器。
 * ========================================================= */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
