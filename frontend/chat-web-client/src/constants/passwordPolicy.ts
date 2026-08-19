import { VALIDATION_CONFIG } from "../config";

export const PASSWORD_MIN_LENGTH = VALIDATION_CONFIG.PASSWORD_MIN_LENGTH;

export const hasMinimumPasswordLength = (password: string): boolean =>
  password.length >= PASSWORD_MIN_LENGTH;
