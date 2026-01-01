/**
 * Utilities for sanitizing and validating Git branch/tag names.
 * Based on git-check-ref-format rules.
 */

// Invalid characters for branch names (based on git-check-ref-format)
// Forbidden: space, ~, ^, :, ?, *, [, \, control chars, @{ sequence
// We also block: ], {, }, <, >, |, ", ', ` for safety
// Allowed: #, $, %, &, (, ), +, ,, ;, =, !
const INVALID_CHARS_REGEX = /[\\~^:?*[\]@{}<>|"'`]/g;
// Multiple consecutive dots
const MULTIPLE_DOTS_REGEX = /\.{2,}/g;
// Multiple consecutive hyphens
const MULTIPLE_HYPHENS_REGEX = /-{2,}/g;
// Multiple consecutive slashes
const MULTIPLE_SLASHES_REGEX = /\/{2,}/g;
// Spaces and tabs
const WHITESPACE_REGEX = /[\s\t]+/g;
// Invalid start characters
const INVALID_START_REGEX = /^[./-]+/;
// Invalid end characters for real-time sanitization
// Note: We don't include hyphen here to allow typing "hello-world" (hyphen mid-typing is OK)
// Validation will catch trailing hyphens when checking the final name
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
 * Get translated error message for a validation error
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
 * This is called on every keystroke for real-time feedback.
 */
export function sanitizeBranchName(
  value: string,
  options: SanitizeOptions = {}
): string {
  const {
    convertSpacesToHyphens = true,
    removeInvalidChars = true,
    trimWhitespace = true,
    allowSlashes = true,
    allowTrailingSlash = false,
    maxLength = 255,
  } = options;

  let result = value;

  // Convert spaces to hyphens FIRST (before trim, so spaces become hyphens)
  if (convertSpacesToHyphens) {
    result = result.replace(WHITESPACE_REGEX, '-');
  }

  // Trim whitespace from start/end (only affects remaining whitespace if convertSpacesToHyphens is false)
  if (trimWhitespace) {
    result = result.trim();
  }

  // Remove invalid characters
  if (removeInvalidChars) {
    result = result.replace(INVALID_CHARS_REGEX, '');
  }

  // Remove slashes if not allowed
  if (!allowSlashes) {
    result = result.replace(/\//g, '-');
  }

  // Clean up multiple consecutive dots
  result = result.replace(MULTIPLE_DOTS_REGEX, '.');

  // Clean up multiple consecutive hyphens
  result = result.replace(MULTIPLE_HYPHENS_REGEX, '-');

  // Clean up multiple consecutive slashes
  if (allowSlashes) {
    result = result.replace(MULTIPLE_SLASHES_REGEX, '/');
  }

  // Remove invalid start characters (but preserve for prefixes that may need /)
  result = result.replace(INVALID_START_REGEX, '');

  // Remove invalid end characters (unless allowing trailing slash for prefixes)
  if (!allowTrailingSlash) {
    result = result.replace(INVALID_END_REGEX, '');
  } else {
    // For prefixes, only remove dots and hyphens at end, keep slash
    result = result.replace(/[.-]+$/, '');
  }

  // Enforce max length
  if (result.length > maxLength) {
    result = result.substring(0, maxLength);
  }

  return result;
}

/**
 * Sanitize a tag name (more restrictive than branch names).
 * Tags typically don't allow slashes.
 */
export function sanitizeTagName(value: string): string {
  return sanitizeBranchName(value, {
    allowSlashes: false,
  });
}

/**
 * Sanitize a prefix name (for GitFlow prefixes like feature/, release/).
 * Allows trailing slash.
 */
export function sanitizePrefixName(value: string): string {
  let result = sanitizeBranchName(value, {
    allowSlashes: true,
    allowTrailingSlash: true,
  });

  // Ensure prefix ends with slash if it has content
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

  // Sanitize first
  const sanitizedValue =
    mode === 'tag'
      ? sanitizeTagName(value)
      : mode === 'prefix'
        ? sanitizePrefixName(value)
        : sanitizeBranchName(value);

  // Check if empty
  if (!sanitizedValue || sanitizedValue.length === 0) {
    errors.push(ValidationError.EMPTY);
    return { isValid: false, errors, sanitizedValue };
  }

  // For prefixes, remove trailing slash for validation
  const valueToValidate =
    mode === 'prefix' ? sanitizedValue.replace(/\/$/, '') : sanitizedValue;

  // Check for invalid start characters
  if (/^[.-]/.test(valueToValidate)) {
    errors.push(ValidationError.INVALID_START);
  }

  // Check for invalid end characters (includes trailing hyphens)
  if (/[.\-]$|\.lock$/i.test(valueToValidate)) {
    errors.push(ValidationError.INVALID_END);
  }

  // Check for double dots
  if (/\.\./.test(valueToValidate)) {
    errors.push(ValidationError.DOUBLE_DOTS);
  }

  // Check for double slashes (only for branch mode)
  if (mode === 'branch' && /\/\//.test(valueToValidate)) {
    errors.push(ValidationError.DOUBLE_SLASHES);
  }

  // Check for remaining invalid characters
  if (INVALID_CHARS_REGEX.test(valueToValidate)) {
    errors.push(ValidationError.INVALID_CHARS);
  }

  // Check if name already exists
  const normalizedValue = sanitizedValue.toLowerCase();
  const normalizedExisting = existingNames.map((n) => n.toLowerCase());
  if (normalizedExisting.includes(normalizedValue)) {
    errors.push(ValidationError.ALREADY_EXISTS);
  }

  // Check length
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
 * Check if a branch name is valid (simple boolean check).
 */
export function isValidBranchName(
  value: string,
  existingNames: string[] = []
): boolean {
  return validateBranchName(value, existingNames).isValid;
}

/**
 * Check if a tag name is valid.
 */
export function isValidTagName(
  value: string,
  existingNames: string[] = []
): boolean {
  return validateBranchName(value, existingNames, { mode: 'tag' }).isValid;
}

/**
 * Check if a prefix name is valid.
 */
export function isValidPrefixName(value: string): boolean {
  return validateBranchName(value, [], { mode: 'prefix' }).isValid;
}
