/**
 * Utilities for sanitizing and validating Git branch/tag names.
 * Based on git-check-ref-format rules.
 */

// Forbidden: space, ~, ^, :, ?, *, [, \, control chars, @{ sequence
// Also blocked for safety: ], {, }, <, >, |, ", ', `
const INVALID_CHARS_REGEX = /[\\~^:?*[\]@{}<>|"'`]/g;
const MULTIPLE_DOTS_REGEX = /\.{2,}/g;
const MULTIPLE_HYPHENS_REGEX = /-{2,}/g;
const MULTIPLE_SLASHES_REGEX = /\/{2,}/g;
const WHITESPACE_REGEX = /[\s\t]+/g;
const INVALID_START_REGEX = /^[./-]+/;
// Hyphen not included to allow typing "hello-world" mid-input
const INVALID_END_REGEX = /[./]+$|\.lock$/i;

export interface SanitizeOptions {
  /** Convert spaces to hyphens (default: true) */
  convertSpacesToHyphens?: boolean;
  /** Remove invalid characters (default: true) */
  removeInvalidChars?: boolean;
  /** Trim whitespace from start/end (default: true) */
  trimWhitespace?: boolean;
  /** Allow slashes for path-like names (default: true for branches, false for tags) */
  allowSlashes?: boolean;
  /** Allow trailing slash for prefixes (default: false) */
  allowTrailingSlash?: boolean;
  /** Maximum length (default: 255) */
  maxLength?: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  sanitizedValue: string;
}

export enum ValidationError {
  EMPTY = 'empty',
  INVALID_START = 'invalid_start',
  INVALID_END = 'invalid_end',
  INVALID_CHARS = 'invalid_chars',
  ALREADY_EXISTS = 'already_exists',
  TOO_LONG = 'too_long',
  DOUBLE_DOTS = 'double_dots',
  DOUBLE_SLASHES = 'double_slashes',
}

/**
 * Get translated error message key for a validation error.
 */
export function getValidationErrorKey(error: ValidationError): string {
  const errorKeys: Record<ValidationError, string> = {
    [ValidationError.EMPTY]: 'validation.branchNameEmpty',
    [ValidationError.INVALID_START]: 'validation.branchNameInvalidStart',
    [ValidationError.INVALID_END]: 'validation.branchNameInvalidEnd',
    [ValidationError.INVALID_CHARS]: 'validation.branchNameInvalidChars',
    [ValidationError.ALREADY_EXISTS]: 'validation.branchNameExists',
    [ValidationError.TOO_LONG]: 'validation.branchNameTooLong',
    [ValidationError.DOUBLE_DOTS]: 'validation.branchNameDoubleDots',
    [ValidationError.DOUBLE_SLASHES]: 'validation.branchNameDoubleSlashes',
  };
  return errorKeys[error];
}

/**
 * Sanitize a branch name by removing/replacing invalid characters.
 */
export function sanitizeBranchName(value: string, options: SanitizeOptions = {}): string {
  const {
    convertSpacesToHyphens = true,
    removeInvalidChars = true,
    trimWhitespace = true,
    allowSlashes = true,
    allowTrailingSlash = false,
    maxLength = 255,
  } = options;

  let result = value;

  if (convertSpacesToHyphens) {
    result = result.replace(WHITESPACE_REGEX, '-');
  }

  if (trimWhitespace) {
    result = result.trim();
  }

  if (removeInvalidChars) {
    result = result.replace(INVALID_CHARS_REGEX, '');
  }

  if (!allowSlashes) {
    result = result.replace(/\//g, '-');
  }

  result = result.replace(MULTIPLE_DOTS_REGEX, '.');
  result = result.replace(MULTIPLE_HYPHENS_REGEX, '-');

  if (allowSlashes) {
    result = result.replace(MULTIPLE_SLASHES_REGEX, '/');
  }

  result = result.replace(INVALID_START_REGEX, '');

  if (!allowTrailingSlash) {
    result = result.replace(INVALID_END_REGEX, '');
  } else {
    result = result.replace(/[.-]+$/, '');
  }

  if (result.length > maxLength) {
    result = result.substring(0, maxLength);
  }

  return result;
}

/**
 * Sanitize a tag name (more restrictive, no slashes).
 */
export function sanitizeTagName(value: string): string {
  return sanitizeBranchName(value, { allowSlashes: false });
}

/**
 * Sanitize a prefix name (allows trailing slash).
 */
export function sanitizePrefixName(value: string): string {
  let result = sanitizeBranchName(value, {
    allowSlashes: true,
    allowTrailingSlash: true,
  });

  if (result.length > 0 && !result.endsWith('/')) {
    result += '/';
  }

  return result;
}

/**
 * Validate a branch name and return detailed validation result.
 */
export function validateBranchName(
  value: string,
  existingNames: string[] = [],
  options: { mode?: 'branch' | 'tag' | 'prefix' } = {}
): ValidationResult {
  const { mode = 'branch' } = options;
  const errors: ValidationError[] = [];

  const sanitizedValue =
    mode === 'tag'
      ? sanitizeTagName(value)
      : mode === 'prefix'
        ? sanitizePrefixName(value)
        : sanitizeBranchName(value);

  if (!sanitizedValue || sanitizedValue.length === 0) {
    errors.push(ValidationError.EMPTY);
    return { isValid: false, errors, sanitizedValue };
  }

  const valueToValidate = mode === 'prefix' ? sanitizedValue.replace(/\/$/, '') : sanitizedValue;

  if (/^[.-]/.test(valueToValidate)) {
    errors.push(ValidationError.INVALID_START);
  }

  if (/[.-]$|\.lock$/i.test(valueToValidate)) {
    errors.push(ValidationError.INVALID_END);
  }

  if (/\.\./.test(valueToValidate)) {
    errors.push(ValidationError.DOUBLE_DOTS);
  }

  if (mode === 'branch' && /\/\//.test(valueToValidate)) {
    errors.push(ValidationError.DOUBLE_SLASHES);
  }

  if (INVALID_CHARS_REGEX.test(valueToValidate)) {
    errors.push(ValidationError.INVALID_CHARS);
  }

  const normalizedValue = sanitizedValue.toLowerCase();
  const normalizedExisting = existingNames.map((n) => n.toLowerCase());
  if (normalizedExisting.includes(normalizedValue)) {
    errors.push(ValidationError.ALREADY_EXISTS);
  }

  if (sanitizedValue.length > 255) {
    errors.push(ValidationError.TOO_LONG);
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedValue,
  };
}

/**
 * Check if a branch name is valid.
 */
export function isValidBranchName(value: string, existingNames: string[] = []): boolean {
  return validateBranchName(value, existingNames).isValid;
}

/**
 * Check if a tag name is valid.
 */
export function isValidTagName(value: string, existingNames: string[] = []): boolean {
  return validateBranchName(value, existingNames, { mode: 'tag' }).isValid;
}

/**
 * Check if a prefix name is valid.
 */
export function isValidPrefixName(value: string): boolean {
  return validateBranchName(value, [], { mode: 'prefix' }).isValid;
}
