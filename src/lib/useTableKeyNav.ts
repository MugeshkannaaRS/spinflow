/**
 * useTableKeyNav — Excel-style keyboard navigation for table-based data entry.
 *
 * Behaviour:
 *   Enter        → move down one row (same column)
 *   Shift+Enter  → move up one row (same column)
 *   Tab          → move right one column; wraps to next row at last col
 *   Shift+Tab    → move left one column; wraps to prev row at first col
 *   ArrowDown    → move down one row (same column)
 *   ArrowUp      → move up one row (same column)
 *   ArrowRight   → move right one column (no row-wrap)
 *   ArrowLeft    → move left one column (no row-wrap)
 *   Escape       → blur current cell
 *
 * Usage:
 *   const nav = useTableKeyNav({ rows: 10, cols: 5 });
 *   // On each table <input>:
 *   <input ref={nav.cellRef(rowIdx, colIdx)} onKeyDown={nav.onKeyDown(rowIdx, colIdx)} ... />
 *
 *   // To skip a column (e.g. a read-only computed cell), pass skipCols:
 *   const nav = useTableKeyNav({ rows: 10, cols: 5, skipCols: [3] });
 */

import { useCallback, useRef } from "react";

interface TableNavOptions {
  rows: number;
  cols: number;
  /** Column indices that are read-only / should be skipped during navigation */
  skipCols?: number[];
}

export function useTableKeyNav({ rows, cols, skipCols = [] }: TableNavOptions) {
  // 2-D ref map: refs[row][col] → HTMLInputElement | null
  const refs = useRef<Map<string, HTMLInputElement | null>>(new Map());

  const key = (r: number, c: number) => `${r},${c}`;

  /** Attach this ref callback to each <input> */
  const cellRef = useCallback(
    (row: number, col: number) => (el: HTMLInputElement | null) => {
      refs.current.set(key(row, col), el);
    },
    [],
  );

  /** Focus a cell by row/col, clamped to valid range */
  const focusCell = useCallback(
    (row: number, col: number) => {
      const r = Math.max(0, Math.min(rows - 1, row));
      // Skip over any read-only columns in the requested direction
      let c = Math.max(0, Math.min(cols - 1, col));
      // If the target col is skipped, find the nearest non-skipped col
      const skip = new Set(skipCols);
      if (skip.has(c)) {
        // try forward first
        let cf = c + 1;
        while (cf < cols && skip.has(cf)) cf++;
        if (cf < cols) { c = cf; }
        else {
          // try backward
          let cb = c - 1;
          while (cb >= 0 && skip.has(cb)) cb--;
          if (cb >= 0) c = cb;
        }
      }
      const el = refs.current.get(key(r, c));
      if (el) {
        el.focus();
        // Select all text so typing replaces immediately (Excel behaviour)
        el.select();
      }
    },
    [rows, cols, skipCols],
  );

  /** Advance using Tab logic: right → wrap to next row */
  const tabForward = useCallback(
    (row: number, col: number) => {
      const skip = new Set(skipCols);
      let c = col + 1;
      let r = row;
      // Find next non-skipped col
      while (c < cols && skip.has(c)) c++;
      if (c >= cols) {
        c = 0;
        r = row + 1;
        if (r >= rows) return; // end of table — let browser handle
        while (c < cols && skip.has(c)) c++;
      }
      focusCell(r, c);
    },
    [rows, cols, skipCols, focusCell],
  );

  const tabBackward = useCallback(
    (row: number, col: number) => {
      const skip = new Set(skipCols);
      let c = col - 1;
      let r = row;
      while (c >= 0 && skip.has(c)) c--;
      if (c < 0) {
        r = row - 1;
        if (r < 0) return; // start of table — let browser handle
        c = cols - 1;
        while (c >= 0 && skip.has(c)) c--;
      }
      focusCell(r, c);
    },
    [rows, cols, skipCols, focusCell],
  );

  /** Attach this onKeyDown handler to each <input> */
  const onKeyDown = useCallback(
    (row: number, col: number) =>
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        switch (e.key) {
          case "Enter":
            e.preventDefault();
            if (e.shiftKey) focusCell(row - 1, col);
            else focusCell(row + 1, col);
            break;
          case "Tab":
            e.preventDefault();
            if (e.shiftKey) tabBackward(row, col);
            else tabForward(row, col);
            break;
          case "ArrowDown":
            // Only intercept if not inside a <select>; allow default in other cases
            e.preventDefault();
            focusCell(row + 1, col);
            break;
          case "ArrowUp":
            e.preventDefault();
            focusCell(row - 1, col);
            break;
          case "ArrowRight": {
            // Only move to next cell if cursor is at end of input
            const input = e.currentTarget;
            if (input.selectionStart === input.value.length) {
              e.preventDefault();
              tabForward(row, col);
            }
            break;
          }
          case "ArrowLeft": {
            const input = e.currentTarget;
            if (input.selectionStart === 0) {
              e.preventDefault();
              tabBackward(row, col);
            }
            break;
          }
          case "Escape":
            e.currentTarget.blur();
            break;
          default:
            break;
        }
      },
    [focusCell, tabForward, tabBackward],
  );

  return { cellRef, onKeyDown };
}
