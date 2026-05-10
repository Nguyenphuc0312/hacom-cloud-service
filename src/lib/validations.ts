/**
 * @fileoverview Zod validation schemas
 * Định nghĩa schemas cho form validation
 */

import { z } from "zod";
import { VALIDATION_CONFIG } from "../config";

// Helper: when i18n may not be initialized at module-load time we store a
// compact marker string containing the translation key and optional params.
// The UI will decode this marker and call `t()` at render time.
const i18nKey = (key: string, params?: Record<string, unknown>) =>
  `__I18N__${key}::${params ? JSON.stringify(params) : "{}"}`;

// ============================================
// AUTH SCHEMAS
// ============================================

/**
 * Schema đăng nhập
 */
export const loginSchema = z.object({
  loginIdentifier: z
    .string()
    .trim()
    .min(1, i18nKey("validation:auth.loginIdentifierRequired"))
    .max(255, i18nKey("validation:auth.loginIdentifierMax")),
  password: z
    .string()
    .min(1, i18nKey("validation:auth.passwordRequired"))
    .min(
      VALIDATION_CONFIG.PASSWORD_MIN_LENGTH,
      i18nKey("validation:auth.passwordMin", {
        count: VALIDATION_CONFIG.PASSWORD_MIN_LENGTH,
      }),
    )
    .max(
      VALIDATION_CONFIG.PASSWORD_MAX_LENGTH,
      i18nKey("validation:auth.passwordMax", {
        count: VALIDATION_CONFIG.PASSWORD_MAX_LENGTH,
      }),
    ),
  rememberMe: z.boolean().optional().default(false),
});

export type LoginFormData = z.infer<typeof loginSchema>;

/**
 * Schema đăng ký
 */
export const registerSchema = z
  .object({
    email: z
      .string()
      .min(1, i18nKey("validation:auth.emailRequired"))
      .email(i18nKey("validation:auth.emailInvalid")),
    password: z
      .string()
      .min(1, i18nKey("validation:auth.passwordRequired"))
      .min(
        VALIDATION_CONFIG.PASSWORD_MIN_LENGTH,
        i18nKey("validation:auth.passwordMin", {
          count: VALIDATION_CONFIG.PASSWORD_MIN_LENGTH,
        }),
      )
      .max(
        VALIDATION_CONFIG.PASSWORD_MAX_LENGTH,
        i18nKey("validation:auth.passwordMax", {
          count: VALIDATION_CONFIG.PASSWORD_MAX_LENGTH,
        }),
      ),
    confirmPassword: z
      .string()
      .min(1, i18nKey("validation:auth.confirmPasswordRequired")),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: i18nKey("validation:auth.acceptTerms") }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: i18nKey("validation:auth.confirmPasswordMismatch"),
    path: ["confirmPassword"],
  });

export type RegisterFormData = z.infer<typeof registerSchema>;

/**
 * Schema quên mật khẩu
 */
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, i18nKey("validation:auth.emailRequired"))
    .email(i18nKey("validation:auth.emailInvalid")),
});

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export const emailOtpSchema = z.object({
  otp: z
    .string()
    .min(6, i18nKey("validation:auth.otpRequired"))
    .regex(/^\d{6}$/, i18nKey("validation:auth.otpSixDigits")),
});

export type EmailOtpFormData = z.infer<typeof emailOtpSchema>;

/**
 * Schema đặt lại mật khẩu
 */
export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(1, i18nKey("validation:auth.passwordRequired"))
      .min(
        VALIDATION_CONFIG.PASSWORD_MIN_LENGTH,
        i18nKey("validation:auth.passwordMin", {
          count: VALIDATION_CONFIG.PASSWORD_MIN_LENGTH,
        }),
      ),
    confirmPassword: z
      .string()
      .min(1, i18nKey("validation:auth.confirmPasswordRequired")),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: i18nKey("validation:auth.confirmPasswordMismatch"),
    path: ["confirmPassword"],
  });

export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

// ============================================
// USER SCHEMAS
// ============================================

/**
 * Schema cập nhật profile
 */
export const updateProfileSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  bio: z
    .string()
    .max(
      VALIDATION_CONFIG.BIO_MAX_LENGTH,
      i18nKey("validation:profile.bioMax", {
        count: VALIDATION_CONFIG.BIO_MAX_LENGTH,
      }),
    )
    .optional(),
  phone: z
    .string()
    .regex(/^\+?[0-9]{10,15}$/, i18nKey("validation:profile.phoneInvalid"))
    .optional()
    .or(z.literal("")),
});

export type UpdateProfileFormData = z.infer<typeof updateProfileSchema>;

/**
 * Schema đổi mật khẩu
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, i18nKey("validation:password.currentRequired")),
    newPassword: z
      .string()
      .min(1, i18nKey("validation:password.newRequired"))
      .min(
        VALIDATION_CONFIG.PASSWORD_MIN_LENGTH,
        i18nKey("validation:auth.passwordMin", {
          count: VALIDATION_CONFIG.PASSWORD_MIN_LENGTH,
        }),
      ),
    confirmPassword: z
      .string()
      .min(1, i18nKey("validation:auth.confirmPasswordRequired")),
    logoutOtherDevices: z.boolean().default(true),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: i18nKey("validation:auth.confirmPasswordMismatch"),
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: i18nKey("validation:password.mustBeDifferent"),
    path: ["newPassword"],
  });

export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

// ============================================
// ROOM SCHEMAS
// ============================================

/**
 * Schema tạo phòng chat nhóm
 */
export const createRoomSchema = z.object({
  name: z
    .string()
    .min(1, i18nKey("validation:room.nameRequired"))
    .min(2, i18nKey("validation:room.nameMin"))
    .max(100, i18nKey("validation:room.nameMax")),
  description: z
    .string()
    .max(500, i18nKey("validation:room.descriptionMax"))
    .optional(),
  memberIds: z
    .array(z.string())
    .min(1, i18nKey("validation:room.memberMin"))
    .max(199, i18nKey("validation:room.memberMax")),
});

export type CreateRoomFormData = z.infer<typeof createRoomSchema>;

// ============================================
// MESSAGE SCHEMAS
// ============================================

/**
 * Schema gửi tin nhắn
 */
export const sendMessageSchema = z.object({
  content: z
    .string()
    .min(1, i18nKey("validation:message.contentRequired"))
    .max(
      VALIDATION_CONFIG.MESSAGE_MAX_LENGTH,
      i18nKey("validation:message.contentMax", {
        count: VALIDATION_CONFIG.MESSAGE_MAX_LENGTH,
      }),
    ),
});

export type SendMessageFormData = z.infer<typeof sendMessageSchema>;

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Tính độ mạnh của mật khẩu
 * @returns 'weak' | 'medium' | 'strong'
 */
export const calculatePasswordStrength = (
  password: string,
): "weak" | "medium" | "strong" => {
  if (!password) return "weak";

  let score = 0;

  // Độ dài
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;

  // Chứa chữ thường
  if (/[a-z]/.test(password)) score += 1;

  // Chứa chữ hoa
  if (/[A-Z]/.test(password)) score += 1;

  // Chứa số
  if (/[0-9]/.test(password)) score += 1;

  // Chứa ký tự đặc biệt
  if (/[^a-zA-Z0-9]/.test(password)) score += 2;

  if (score <= 3) return "weak";
  if (score <= 5) return "medium";
  return "strong";
};
