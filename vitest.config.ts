import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "web/lib/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "web/lib/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts", "web/lib/**/*.test.ts"],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
