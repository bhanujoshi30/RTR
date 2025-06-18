import { AuthGuard } from '@/components/auth/AuthGuard';

// This page effectively acts as a loading/redirect handler.
// The actual content will be shown by AuthGuard or redirected.
export default function HomePage() {
  return (
    <AuthGuard>
      {/* Children will be rendered if user is authenticated and not on login/register page.
          Or, if user is not authenticated and on login/register.
          Typically, for the root page, if authenticated, AuthGuard redirects to /dashboard.
          If not, AuthGuard redirects to /login.
          So this children part might not often be visible directly from '/'.
      */}
       <div className="flex h-screen w-full items-center justify-center bg-background">
        {/* This content is unlikely to be seen if AuthGuard properly redirects */}
      </div>
    </AuthGuard>
  );
}
