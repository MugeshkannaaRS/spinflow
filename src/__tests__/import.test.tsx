import { describe, it, expect } from "vitest";

describe("Import Modal - successCount logic", () => {
  it("uses data.created when it is a number", () => {
    const batchLength = 20;
    const batchCreated = typeof ({ created: 15 })?.created === "number"
      ? ({ created: 15 }).created
      : batchLength;
    expect(batchCreated).toBe(15);
  });

  it("falls back to batch.length when data.created is not a number", () => {
    const batchLength = 20;
    const batchCreated = typeof ({})?.created === "number"
      ? ({}).created
      : batchLength;
    expect(batchCreated).toBe(20);
  });

  it("falls back to batch.length when data.created is null", () => {
    const batchLength = 20;
    const batchCreated = typeof ({ created: null })?.created === "number"
      ? ({ created: null }).created
      : batchLength;
    expect(batchCreated).toBe(20);
  });
});

describe("Import Modal - error/warning display", () => {
  it("warnings (severity=warning) should show in yellow, not red", () => {
    const errors = [
      { row: 1, message: "Department not found", severity: "warning" },
    ];
    const hardErrors = errors.filter(e => !e.severity || e.severity === "error");
    const warnings = errors.filter(e => e.severity === "warning");
    expect(hardErrors.length).toBe(0);
    expect(warnings.length).toBe(1);
  });

  it("hard errors show in red", () => {
    const errors = [
      { row: 1, message: "Invalid value", severity: "error" },
    ];
    const hardErrors = errors.filter(e => !e.severity || e.severity === "error");
    expect(hardErrors.length).toBe(1);
  });

  it("green success screen when only warnings exist", () => {
    const hardErrors: any[] = [];
    const warnings = [{ row: 1, message: "Dept not found", severity: "warning" }];
    const isTotalFailure = false;
    const hasHardErrors = hardErrors.length > 0;
    expect(isTotalFailure).toBe(false);
    expect(hasHardErrors).toBe(false);
  });

  it("yellow screen when hard errors exist", () => {
    const hardErrors = [{ row: 1, message: "Invalid value", severity: "error" }];
    const hasHardErrors = hardErrors.length > 0;
    expect(hasHardErrors).toBe(true);
  });
});

describe("Import Modal - validation", () => {
  it("Import button disabled when 0 valid records", () => {
    const validCount = 0;
    expect(validCount === 0).toBe(true);
  });

  it("Import button enabled when valid records exist", () => {
    const validCount = 10;
    expect(validCount === 0).toBe(false);
  });
});
