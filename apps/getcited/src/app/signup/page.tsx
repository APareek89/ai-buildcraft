import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/login-form';
export const metadata = { title: 'Create account · GetCited' };
export default function SignupPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Create your GetCited account</h1>
          <p className="mt-2 text-sm text-muted-foreground">Save your brand, reports and action plans.</p>
        </div>
        <Suspense fallback={<p>Loading account form…</p>}><LoginForm signup /></Suspense>
      </div>
    </main>
  );
}
