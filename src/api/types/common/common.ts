export interface ApiErrorBody {
  success?: boolean;
  code?: string;
  message?: string;
  details?: unknown;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export interface ApiResponse<T> {
  success?: boolean;
  data: T;
  meta?: Record<string, unknown>;
  message?: string;
}

export interface SelectOption {
  label: string;
  value: string;
}
