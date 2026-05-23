import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "./time";

describe("formatRelativeTime", () => {
  it('returns "just now" for timestamps under 60 seconds', () => {
    const recent = new Date(Date.now() - 30 * 1000).toISOString();
    expect(formatRelativeTime(recent)).toBe("just now");
  });

  it('returns "1 min ago" for 1 minute ago', () => {
    const oneMin = new Date(Date.now() - 60 * 1000).toISOString();
    expect(formatRelativeTime(oneMin)).toBe("1 min ago");
  });

  it('returns "45 min ago" for 45 minutes ago', () => {
    const fortyFiveMin = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    expect(formatRelativeTime(fortyFiveMin)).toBe("45 min ago");
  });

  it('returns "1 hr ago" for 1 hour ago', () => {
    const oneHr = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(oneHr)).toBe("1 hr ago");
  });

  it('returns "22 hr ago" for 22 hours ago', () => {
    const twentyTwoHr = new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(twentyTwoHr)).toBe("22 hr ago");
  });

  it('returns "yesterday" for 24-47 hours ago', () => {
    const yesterday = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(yesterday)).toBe("yesterday");
  });

  it("returns a date string for 48+ hours ago", () => {
    const threeDays = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatRelativeTime(threeDays);
    expect(result).not.toBe("");
    expect(result).not.toBe("just now");
    expect(result).not.toContain("min ago");
    expect(result).not.toContain("hr ago");
    expect(result).not.toBe("yesterday");
  });

  it("returns empty string for null input", () => {
    expect(formatRelativeTime(null)).toBe("");
  });

  it("returns empty string for undefined input", () => {
    expect(formatRelativeTime(undefined)).toBe("");
  });

  it("returns empty string for invalid date string", () => {
    expect(formatRelativeTime("not-a-date")).toBe("");
  });
});
