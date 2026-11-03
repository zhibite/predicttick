import VerifyEmailForm from "@/components/auth/VerifyEmailForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify email | PolyKlines",
  description: "Verify your PolyKlines email address.",
};

interface VerifyEmailPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function VerifyEmail({
  searchParams,
}: VerifyEmailPageProps) {
  const params = await searchParams;
  return <VerifyEmailForm token={params.token} />;
}
