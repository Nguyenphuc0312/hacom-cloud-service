import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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

  useEffect(() => {
    setFocus("email");
  }, [setFocus]);

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setIsLoading(true);

    try {
      await apiClient.post("/auth/forgot-password", data);
      setIsSubmitted(true);
      toast.success(t("auth:toast.forgotPasswordSent"));
    } catch {
      setIsSubmitted(true);
      toast.success(t("auth:toast.forgotPasswordFallback"));
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 px-4 py-12">
        <div className="relative w-full max-w-md">
          <div className="bg-surface rounded-2xl shadow-xl border border-border p-8 text-center animate-fade-in">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-success/15 rounded-full mb-6">
              <CheckCircleIcon className="w-8 h-8 text-success" />
            </div>

            <h1 className="text-2xl font-bold text-text-primary mb-2">
              {t("auth:forgot.successTitle")}
            </h1>
            <p className="text-text-muted mb-6">
              {t("auth:forgot.successDescription")} {" "}
              <span className="font-medium text-text-primary">
                {getValues("email")}
              </span>
            </p>

            <div className="space-y-4">
              <p className="text-sm text-text-muted">
                {t("auth:forgot.successHint")}
              </p>
              <Button
                variant="outline"
                fullWidth
                onClick={() => setIsSubmitted(false)}
              >
                {t("auth:forgot.tryAnotherEmail")}
              </Button>
              <Link to="/login">
                <Button variant="ghost" fullWidth>
                  <ArrowLeftIcon className="w-4 h-4 mr-2" />
                  {t("auth:forgot.backToLogin")}
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
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-secondary/15 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-surface rounded-2xl shadow-xl border border-border p-8 animate-fade-in">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-2xl mb-4 shadow-lg shadow-elev2">
              <ChatBubbleLeftRightIcon className="w-8 h-8 text-text-inverse" />
            </div>
            <h1 className="text-2xl font-bold text-text-primary">{t("auth:forgot.title")}</h1>
            <p className="text-text-muted mt-2">
              {t("auth:forgot.subtitle")}
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Input
              {...register("email")}
              type="email"
              label={t("auth:login.email")}
              placeholder={t("auth:placeholders.email")}
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
              {t("auth:forgot.submit")}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="inline-flex items-center text-sm text-text-muted hover:text-text-secondary"
            >
              <ArrowLeftIcon className="w-4 h-4 mr-1" />
              {t("auth:forgot.backToLogin")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
