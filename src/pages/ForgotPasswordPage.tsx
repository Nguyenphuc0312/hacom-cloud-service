/**
 * @fileoverview Forgot Password Page
 * Trang quên mật khẩu
 */

import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  EnvelopeIcon,
  ChatBubbleLeftRightIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { Button, Input, toast } from "../components/ui";
import { forgotPasswordSchema } from "../lib/validations";
import type { ForgotPasswordFormData } from "../lib/validations";
import apiClient from "../lib/axios";

export const ForgotPasswordPage: React.FC = () => {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // React Hook Form
  const {
    register,
    handleSubmit,
    formState: { errors },
    setFocus,
    getValues,
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  // Auto-focus email input
  useEffect(() => {
    setFocus("email");
  }, [setFocus]);

  // Submit handler
  const onSubmit = async (data: ForgotPasswordFormData) => {
    setIsLoading(true);

    try {
      await apiClient.post("/auth/forgot-password", data);
      setIsSubmitted(true);
      toast.success("Email đặt lại mật khẩu đã được gửi!");
    } catch {
      // Vẫn hiển thị thành công để tránh leak thông tin user
      setIsSubmitted(true);
      toast.success(
        "Nếu email tồn tại, bạn sẽ nhận được link đặt lại mật khẩu",
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Success state
  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 px-4 py-12">
        <div className="relative w-full max-w-md">
          <div className="bg-surface rounded-2xl shadow-xl border border-border p-8 text-center animate-fade-in">
            {/* Success icon */}
            <div className="inline-flex items-center justify-center w-16 h-16 bg-success/15 rounded-full mb-6">
              <CheckCircleIcon className="w-8 h-8 text-success" />
            </div>

            <h1 className="text-2xl font-bold text-text-primary mb-2">
              Kiểm tra email của bạn
            </h1>
            <p className="text-text-muted mb-6">
              Chúng tôi đã gửi hướng dẫn đặt lại mật khẩu đến{" "}
              <span className="font-medium text-text-primary">
                {getValues("email")}
              </span>
            </p>

            <div className="space-y-4">
              <p className="text-sm text-text-muted">
                Không nhận được email? Kiểm tra thư mục spam hoặc
              </p>
              <Button
                variant="outline"
                fullWidth
                onClick={() => setIsSubmitted(false)}
              >
                Thử lại với email khác
              </Button>
              <Link to="/login">
                <Button variant="ghost" fullWidth>
                  <ArrowLeftIcon className="w-4 h-4 mr-2" />
                  Quay lại đăng nhập
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 px-4 py-12">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-secondary/15 rounded-full blur-3xl" />
      </div>

      {/* Card */}
      <div className="relative w-full max-w-md">
        <div className="bg-surface rounded-2xl shadow-xl border border-border p-8 animate-fade-in">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-2xl mb-4 shadow-lg shadow-elev2">
              <ChatBubbleLeftRightIcon className="w-8 h-8 text-text-inverse" />
            </div>
            <h1 className="text-2xl font-bold text-text-primary">Quên mật khẩu?</h1>
            <p className="text-text-muted mt-2">
              Nhập email của bạn, chúng tôi sẽ gửi link đặt lại mật khẩu
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Input
              {...register("email")}
              type="email"
              label="Email"
              placeholder="you@example.com"
              leftIcon={<EnvelopeIcon className="w-5 h-5" />}
              error={errors.email?.message}
              autoComplete="email"
              disabled={isLoading}
            />

            <Button
              type="submit"
              fullWidth
              size="lg"
              isLoading={isLoading}
              disabled={isLoading}
            >
              Gửi link đặt lại mật khẩu
            </Button>
          </form>

          {/* Back to login */}
          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="inline-flex items-center text-sm text-text-muted hover:text-text-secondary"
            >
              <ArrowLeftIcon className="w-4 h-4 mr-1" />
              Quay lại đăng nhập
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;


