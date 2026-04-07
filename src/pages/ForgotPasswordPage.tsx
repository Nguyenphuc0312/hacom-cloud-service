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
import { AuthCard, AuthShell } from "../components/auth";
import { Button, Input, toast } from "../components/ui";
import { forgotPasswordSchema } from "../lib/validations";
import type { ForgotPasswordFormData } from "../lib/validations";
import { authClient } from "../lib/axios";
import { AUTH_ENDPOINTS } from "../lib/authEndpoints";

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
      await authClient.post(AUTH_ENDPOINTS.forgotPassword, data);
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
      <AuthShell maxWidth="md">
        <AuthCard className="p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-success/15 rounded-full mb-6">
            <CheckCircleIcon className="w-8 h-8 text-success" />
          </div>

          <h1 className="text-2xl font-bold text-text-primary mb-2">
            {t("auth:forgot.successTitle")}
          </h1>
          <p className="text-text-muted mb-6">
            {t("auth:forgot.successDescription")}{" "}
            <span className="font-medium text-text-primary">
              {getValues("email")}
            </span>
          </p>
          <p className="mb-6 text-sm text-text-muted">
            {t("auth:forgot.securityHint")}
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
        </AuthCard>
      </AuthShell>
    );
  }

  return (
    <AuthShell maxWidth="md">
      <AuthCard className="p-8">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-elev2">
            <ChatBubbleLeftRightIcon className="w-8 h-8 text-text-inverse" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">
            {t("auth:forgot.title")}
          </h1>
          <p className="text-text-muted mt-2">{t("auth:forgot.subtitle")}</p>
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
      </AuthCard>
    </AuthShell>
  );
};

export default ForgotPasswordPage;
