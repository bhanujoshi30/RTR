import { AuthGuard } from '@/components/auth/AuthGuard';
import { RegisterForm } from '@/components/auth/RegisterForm';

export default function RegisterPage() {
  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <RegisterForm />
      </div>
    </AuthGuard>
  );
}
