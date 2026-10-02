import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { getUser } from "@/lib/auth";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Sign in · GetCited" };

export default async function LoginPage() {
  // Already signed in → straight to Configure.
  if (await getUser()) redirect("/configure");

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link
            href="/"
            aria-label="GetCited home"
            className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-card"
          >
            <Sparkles className="h-5 w-5 text-primary" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to GetCited</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Measure your AI citation share and get a costed plan.
          </p>
        </div>
        <Suspense fallback={<div className="h-64" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
