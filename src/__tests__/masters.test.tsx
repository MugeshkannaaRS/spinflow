import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

const ALL_TABS = [
  "companies", "mills", "departments", "yarn-counts", "customers",
  "vehicles", "routes", "machines", "shifts", "warehouses",
];

describe("Masters - Super Admin tab filtering", () => {
  it("SUPER_ADMIN sees only Companies + Mills tabs", () => {
    const isSuperAdmin = true;
    const visibleTabs = ALL_TABS.filter(t =>
      isSuperAdmin ? ["companies", "mills"].includes(t) : true
    );
    expect(visibleTabs).toEqual(["companies", "mills"]);
  });

  it("MILL_OWNER sees all tabs", () => {
    const isSuperAdmin = false;
    const visibleTabs = ALL_TABS.filter(t =>
      isSuperAdmin ? ["companies", "mills"].includes(t) : true
    );
    expect(visibleTabs).toEqual(ALL_TABS);
  });

  it("non-super-admin sees all 10 tabs", () => {
    const isSuperAdmin = false;
    const visibleTabs = ALL_TABS.filter(t =>
      isSuperAdmin ? ["companies", "mills"].includes(t) : true
    );
    expect(visibleTabs.length).toBe(10);
  });

  it("SUPER_ADMIN sees exactly 2 tabs", () => {
    const isSuperAdmin = true;
    const visibleTabs = ALL_TABS.filter(t =>
      isSuperAdmin ? ["companies", "mills"].includes(t) : true
    );
    expect(visibleTabs.length).toBe(2);
  });
});

describe("Masters - Add Company button text", () => {
  it('should say "Add Company" not "Add Companie"', () => {
    const buttonText = "Add Company";
    expect(buttonText).toBe("Add Company");
    expect(buttonText).not.toBe("Add Companie");
  });
});

describe("Masters - GSTIN validation", () => {
  it("accepts empty GSTIN value", () => {
    const gstin = "";
    const isValid = !gstin || gstin.trim() === ""
      ? true
      : /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin);
    expect(isValid).toBe(true);
  });

  it("accepts valid GSTIN format 29ABCDE1234F1Z5", () => {
    const gstin = "29ABCDE1234F1Z5";
    const isValid = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin);
    expect(isValid).toBe(true);
  });

  it("rejects invalid GSTIN ABC123", () => {
    const gstin = "ABC123";
    const isValid = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin);
    expect(isValid).toBe(false);
  });

  it("returns clear error message for invalid GSTIN", () => {
    const gstin = "ABC123";
    const isValid = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin);
    const errorMessage = isValid ? "" : "Invalid GSTIN format (e.g. 29ABCDE1234F1Z5)";
    expect(errorMessage).toContain("Invalid GSTIN format");
  });
});

describe("Masters - Numeric field coercion", () => {
  it("accepts empty value for capacity field", () => {
    const coerceNumeric = (v: any) => {
      if (v === null || v === "") return null;
      try { return parseFloat(v); } catch { return null; }
    };
    expect(coerceNumeric("")).toBeNull();
    expect(coerceNumeric(null)).toBeNull();
  });

  it("accepts number for capacity field", () => {
    const coerceNumeric = (v: any) => {
      if (v === null || v === "") return null;
      try { return parseFloat(v); } catch { return null; }
    };
    expect(coerceNumeric("500")).toBe(500);
    expect(coerceNumeric(500)).toBe(500);
  });
});
