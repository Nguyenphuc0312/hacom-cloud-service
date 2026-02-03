/**
 * @fileoverview Zod validation schemas
 * Định nghĩa schemas cho form validation
 */

import { z } from "zod";
import { VALIDATION_CONFIG } from "../config";

// ============================================
// AUTH SCHEMAS
// ============================================

/**
 * Schema đăng nhập
 */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email không được để trống")
    .email("Email không hợp lệ"),
  password: z
    .string()
    .min(1, "Mật khẩu không được để trống")
    .min(
      VALIDATION_CONFIG.PASSWORD_MIN_LENGTH,
      `Mật khẩu phải có ít nhất ${VALIDATION_CONFIG.PASSWORD_MIN_LENGTH} ký tự`,
    ),
  rememberMe: z.boolean().optional().default(false),
});

export type LoginFormData = z.infer<typeof loginSchema>;

/**
 * Schema đăng ký
 */
export const registerSchema = z
  .object({
    username: z
      .string()
      .min(1, "Tên người dùng không được để trống")
      .min(
        VALIDATION_CONFIG.USERNAME_MIN_LENGTH,
        `Tên người dùng phải có ít nhất ${VALIDATION_CONFIG.USERNAME_MIN_LENGTH} ký tự`,
      )
      .max(
        VALIDATION_CONFIG.USERNAME_MAX_LENGTH,
        `Tên người dùng không được quá ${VALIDATION_CONFIG.USERNAME_MAX_LENGTH} ký tự`,
      )
      .regex(
        /^[a-zA-Z0-9_]+$/,
        "Tên người dùng chỉ được chứa chữ cái, số và dấu gạch dưới",
      ),
    email: z
      .string()
      .min(1, "Email không được để trống")
      .email("Email không hợp lệ"),
    password: z
      .string()
      .min(1, "Mật khẩu không được để trống")
      .min(
        VALIDATION_CONFIG.PASSWORD_MIN_LENGTH,
        `Mật khẩu phải có ít nhất ${VALIDATION_CONFIG.PASSWORD_MIN_LENGTH} ký tự`,
      )
      .max(
        VALIDATION_CONFIG.PASSWORD_MAX_LENGTH,
        `Mật khẩu không được quá ${VALIDATION_CONFIG.PASSWORD_MAX_LENGTH} ký tự`,
      )
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        "Mật khẩu phải chứa ít nhất 1 chữ thường, 1 chữ hoa và 1 số",
      ),
    confirmPassword: z.string().min(1, "Xác nhận mật khẩu không được để trống"),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: "Bạn phải đồng ý với điều khoản sử dụng" }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Mật khẩu xác nhận không khớp",
    path: ["confirmPassword"],
  });

export type RegisterFormData = z.infer<typeof registerSchema>;

/**
 * Schema quên mật khẩu
 */
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, "Email không được để trống")
    .email("Email không hợp lệ"),
});

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

/**
 * Schema đặt lại mật khẩu
 */
export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(1, "Mật khẩu không được để trống")
      .min(
        VALIDATION_CONFIG.PASSWORD_MIN_LENGTH,
        `Mật khẩu phải có ít nhất ${VALIDATION_CONFIG.PASSWORD_MIN_LENGTH} ký tự`,
      )
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        "Mật khẩu phải chứa ít nhất 1 chữ thường, 1 chữ hoa và 1 số",
      ),
    confirmPassword: z.string().min(1, "Xác nhận mật khẩu không được để trống"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Mật khẩu xác nhận không khớp",
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
      `Bio không được quá ${VALIDATION_CONFIG.BIO_MAX_LENGTH} ký tự`,
    )
    .optional(),
  phone: z
    .string()
    .regex(/^\+?[0-9]{10,15}$/, "Số điện thoại không hợp lệ")
    .optional()
    .or(z.literal("")),
});

export type UpdateProfileFormData = z.infer<typeof updateProfileSchema>;

/**
 * Schema đổi mật khẩu
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Mật khẩu hiện tại không được để trống"),
    newPassword: z
      .string()
      .min(1, "Mật khẩu mới không được để trống")
      .min(
        VALIDATION_CONFIG.PASSWORD_MIN_LENGTH,
        `Mật khẩu phải có ít nhất ${VALIDATION_CONFIG.PASSWORD_MIN_LENGTH} ký tự`,
      )
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        "Mật khẩu phải chứa ít nhất 1 chữ thường, 1 chữ hoa và 1 số",
      ),
    confirmPassword: z.string().min(1, "Xác nhận mật khẩu không được để trống"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Mật khẩu xác nhận không khớp",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "Mật khẩu mới phải khác mật khẩu hiện tại",
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
    .min(1, "Tên nhóm không được để trống")
    .min(2, "Tên nhóm phải có ít nhất 2 ký tự")
    .max(100, "Tên nhóm không được quá 100 ký tự"),
  description: z.string().max(500, "Mô tả không được quá 500 ký tự").optional(),
  memberIds: z
    .array(z.string())
    .min(1, "Phải chọn ít nhất 1 thành viên")
    .max(199, "Nhóm không được quá 200 thành viên"),
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
    .min(1, "Tin nhắn không được để trống")
    .max(
      VALIDATION_CONFIG.MESSAGE_MAX_LENGTH,
      `Tin nhắn không được quá ${VALIDATION_CONFIG.MESSAGE_MAX_LENGTH} ký tự`,
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
