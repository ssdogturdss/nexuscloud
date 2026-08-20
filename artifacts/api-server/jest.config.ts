import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src/tests"],
  testMatch: ["**/*.test.ts"],
  moduleNameMapper: {
    // Map workspace packages to their compiled output (or source)
    "@workspace/db": "<rootDir>/../../lib/db/src/index.ts",
    "@workspace/api-zod": "<rootDir>/../../lib/api-zod/src/index.ts",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      tsconfig: {
        // Relax module resolution for Jest
        module: "CommonJS",
        esModuleInterop: true,
      },
    }],
  },
};

export default config;
