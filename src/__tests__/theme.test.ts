import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "@/hooks/useTheme";

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("default theme is light", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
  });

  it("toggle() switches to dark", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    expect(result.current.theme).toBe("dark");
  });

  it("toggle() switches back to light", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    act(() => result.current.toggle());
    expect(result.current.theme).toBe("light");
  });

  it("persists theme in localStorage key spinflow_theme", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    expect(localStorage.getItem("spinflow_theme")).toBe("dark");
  });

  it("restores theme from localStorage on mount", () => {
    localStorage.setItem("spinflow_theme", "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });

  it("adds dark class to document.documentElement when dark", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("removes dark class from document.documentElement when light", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    act(() => result.current.toggle());
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
