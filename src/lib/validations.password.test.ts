import { describe, expect, it } from "vitest";
import { PASSWORD_MIN_LENGTH } from "../constants/passwordPolicy";
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "./validations";

const shortPassword = "1234567";
const validPassword = "12345678";

describe("password validation rules", () => {
  it("keeps PASSWORD_MIN_LENGTH at 8", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });

  it("rejects register passwords shorter than PASSWORD_MIN_LENGTH", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: shortPassword,
      confirmPassword: shortPassword,
      acceptTerms: true,
    });

    expect(result.success).toBe(false);
  });

  it("accepts register passwords with PASSWORD_MIN_LENGTH characters", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: validPassword,
      confirmPassword: validPassword,
      acceptTerms: true,
    });

    expect(result.success).toBe(true);
  });

  it("rejects login passwords shorter than PASSWORD_MIN_LENGTH", () => {
    const result = loginSchema.safeParse({
      loginIdentifier: "EMP001",
      password: shortPassword,
    });

    expect(result.success).toBe(false);
  });

  it("accepts login passwords with PASSWORD_MIN_LENGTH characters", () => {
    const result = loginSchema.safeParse({
      loginIdentifier: "EMP001",
      password: validPassword,
    });

    expect(result.success).toBe(true);
  });

  it("rejects reset passwords shorter than PASSWORD_MIN_LENGTH", () => {
    const result = resetPasswordSchema.safeParse({
      password: shortPassword,
      confirmPassword: shortPassword,
    });

    expect(result.success).toBe(false);
  });

  it("accepts reset passwords with PASSWORD_MIN_LENGTH characters", () => {
    const result = resetPasswordSchema.safeParse({
      password: validPassword,
      confirmPassword: validPassword,
    });

    expect(result.success).toBe(true);
  });

  it("rejects change-password newPassword shorter than PASSWORD_MIN_LENGTH", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: validPassword,
      newPassword: shortPassword,
      confirmPassword: shortPassword,
    });

    expect(result.success).toBe(false);
  });

  it("accepts change-password newPassword with PASSWORD_MIN_LENGTH characters", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: `${validPassword}-old`,
      newPassword: validPassword,
      confirmPassword: validPassword,
    });

    expect(result.success).toBe(true);
  });
});
