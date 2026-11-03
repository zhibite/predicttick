import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset password | PolyKlines",
  description: "Request a password reset link.",
};

export default function ForgotPassword() {
  return <ForgotPasswordForm />;
}
