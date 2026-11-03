import SignUpForm from "@/components/auth/SignUpForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create account | PolyKlines",
  description: "Create a PolyKlines account.",
};

interface SignUpPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function SignUp({ searchParams }: SignUpPageProps) {
  const params = await searchParams;
  return <SignUpForm nextPath={params.next} />;
}
