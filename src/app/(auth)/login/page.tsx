import { AuthGuard } from '@/components/auth/AuthGuard';
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <LoginForm />
      </div>
    </AuthGuard>
  );
}
