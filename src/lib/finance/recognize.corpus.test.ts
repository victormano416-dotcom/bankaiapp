import { describe, it, expect } from "vitest";
import { recognize } from "./recognize";
import { CORPUS } from "./recognize.corpus";

describe("recognize corpus", () => {
  for (const sample of CORPUS) {
    it(sample.name, () => {
      const result = recognize(sample.text, new Date(sample.now ?? "2026-11-01"));
      if (sample.kind) expect(result.kind).toBe(sample.kind);
      if (sample.method) expect(sample.method).toContain(result.method);
      if (sample.amountCents != null) expect(result.amountCents).toBe(sample.amountCents);
      if (sample.installments != null) expect(result.installments).toBe(sample.installments);
      if (sample.description) expect(result.description).toMatch(sample.description);
    });
  }
});
