
import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { AuthContentWrapper } from '@/components/layout/AuthContentWrapper';
import { LanguageProvider } from '@/context/LanguageContext';

export const metadata: Metadata = {
  title: 'TaskFlow',
  description: 'Manage your projects and tasks with ease.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=PT+Sans:wght@400;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <LanguageProvider>
          <AuthProvider>
            <AuthContentWrapper>{children}</AuthContentWrapper>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
