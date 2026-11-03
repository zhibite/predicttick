import SignInForm from "@/components/auth/SignInForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in | PolyKlines",
  description: "Sign in to your PolyKlines account.",
};

interface SignInPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function SignIn({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  return <SignInForm nextPath={params.next} />;
}
