export interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: string;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface SelectOption {
  label: string;
  value: string;
}
