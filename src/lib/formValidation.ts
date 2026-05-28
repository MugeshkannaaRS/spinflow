export interface ValidationRule {
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  patternMessage?: string;
  custom?: (value: any, data: Record<string, any>) => string | null;
}

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function validateRequired(
  data: Record<string, any>,
  fields: { key: string; label: string }[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const { key, label } of fields) {
    const val = data[key];
    if (val === undefined || val === null || String(val).trim() === "") {
      errors[key] = `${label} is required`;
    }
  }
  return errors;
}

export function validateForm(
  data: Record<string, any>,
  rules: Record<string, ValidationRule>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [field, rule] of Object.entries(rules)) {
    const value = data[field];
    if (rule.required) {
      if (value === undefined || value === null || String(value).trim() === "") {
        errors[field] = `${field} is required`;
        continue;
      }
    }
    if (value === undefined || value === null || String(value).trim() === "") continue;
    const num = Number(value);
    if (rule.min !== undefined && !isNaN(num) && num < rule.min) {
      errors[field] = `${field} must be at least ${rule.min}`;
    }
    if (rule.max !== undefined && !isNaN(num) && num > rule.max) {
      errors[field] = `${field} must be at most ${rule.max}`;
    }
    const str = String(value);
    if (rule.minLength !== undefined && str.length < rule.minLength) {
      errors[field] = `${field} must be at least ${rule.minLength} characters`;
    }
    if (rule.maxLength !== undefined && str.length > rule.maxLength) {
      errors[field] = `${field} must be at most ${rule.maxLength} characters`;
    }
    if (rule.pattern && !rule.pattern.test(str)) {
      errors[field] = rule.patternMessage || `${field} format is invalid`;
    }
    if (rule.custom) {
      const customErr = rule.custom(value, data);
      if (customErr) errors[field] = customErr;
    }
  }
  return errors;
}
