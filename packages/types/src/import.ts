/**
 * Types for import preview and commit results.
 * These should mirror backend WebResponse.data payloads.
 */
export type ImportPreviewError = {
  /** Optional field name related to the error */
  field?: string;
  /** Human-readable error message */
  message: string;
  /** Row number where the validation error occurred */
  row: number;
};

export type ImportPreview = {
  /** First N errors for preview; backend truncates to save bandwidth */
  errors: ImportPreviewError[];
  /** Invalid rows that failed validation */
  invalid: number;
  /** Total rows detected in the uploaded file */
  totalRows: number;
  /** Valid rows that can be imported */
  valid: number;
  /** Rows with warnings that may still be importable */
  warn: number;
};

export type CommitResult = ImportPreview & {
  /** Actually inserted rows after commit */
  inserted: number;
};
