import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = () => "blob:test-preview";
}

if (!globalThis.URL.revokeObjectURL) {
  globalThis.URL.revokeObjectURL = () => {};
}

afterEach(() => {
  cleanup();
});
