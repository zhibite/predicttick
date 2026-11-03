import ResetPasswordForm from "@/components/auth/ResetPasswordForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Choose a new password | PolyKlines",
  description: "Set a new password for your PolyKlines account.",
};

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPassword({
  searchParams,
}: ResetPasswordPageProps) {
  const params = await searchParams;
  return <ResetPasswordForm token={params.token} />;
}
