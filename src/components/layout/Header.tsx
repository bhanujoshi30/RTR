
"use client";

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LogOut, UserCircle, LayoutDashboard, FolderPlus, Menu, Workflow, Users, CalendarCheck, ClipboardList, Loader2, Languages as LanguageIcon } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { updateUserLanguagePreference } from '@/services/userService';
import { useToast } from '@/hooks/use-toast';

export function Header() {
  const { user } = useAuth();
  const { t, locale, setLocale } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loadingLink, setLoadingLink] = useState<string | null>(null);

  useEffect(() => {
    if (loadingLink) {
      setLoadingLink(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleLanguageChange = async (value: string) => {
    const newLocale = value as 'en' | 'hi';
    setLocale(newLocale);
    if (user) {
      try {
        await updateUserLanguagePreference(user.uid, newLocale);
      } catch (error) {
        toast({
          title: "Language Error",
          description: "Could not save your language preference.",
          variant: "destructive",
        });
      }
    }
  };

  const isSupervisor = user?.role === 'supervisor';
  const isMember = user?.role === 'member';
  const isAdmin = user?.role === 'admin';
  const isClient = user?.role === 'client';

  const baseNavLinks = [
    { href: '/dashboard', labelKey: 'header.dashboard', icon: <LayoutDashboard className="mr-2 h-4 w-4" /> },
  ];

  const conditionalNavLinks = [];
  if (user && !isSupervisor && !isMember && !isClient) { 
    conditionalNavLinks.push({ href: '/projects/create', labelKey: 'header.newProject', icon: <FolderPlus className="mr-2 h-4 w-4" /> });
  }
  if (isAdmin) {
    conditionalNavLinks.push({ href: '/users', labelKey: 'header.users', icon: <Users className="mr-2 h-4 w-4" /> });
    conditionalNavLinks.push({ href: '/attendance', labelKey: 'header.attendance', icon: <CalendarCheck className="mr-2 h-4 w-4" /> });
    conditionalNavLinks.push({ href: '/dpr', labelKey: 'header.dpr', icon: <ClipboardList className="mr-2 h-4 w-4" /> });
  }
  
  const navLinks = [...baseNavLinks, ...conditionalNavLinks];


  const NavItems = ({isMobile = false} : {isMobile?: boolean}) => (
    <>
      {navLinks.map((link) => {
        const isLoading = loadingLink === link.href;
        const isActive = pathname === link.href;

        const handleNavClick = () => {
          if (!isActive) {
            setLoadingLink(link.href);
          }
          if (isMobile) {
            setMobileMenuOpen(false);
          }
        };

        return (
          <Button
            variant={isActive && !isLoading ? "secondary" : "ghost"}
            asChild
            key={link.href}
            onClick={handleNavClick}
            disabled={isLoading}
          >
            <Link href={link.href} className={`flex items-center ${isMobile ? 'justify-start w-full text-lg py-3' : ''}`}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : link.icon}
              {t(link.labelKey)}
            </Link>
          </Button>
        );
      })}
    </>
  );

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-card shadow-sm">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/dashboard" className="flex items-center gap-2 text-lg font-semibold font-headline">
          <Workflow className="h-7 w-7 text-primary" />
          <span>TaskFlow</span>
        </Link>

        <nav className="hidden items-center space-x-2 md:flex">
          <NavItems />
        </nav>

        <div className="flex items-center gap-4">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user.photoURL || undefined} alt={user.displayName || user.email || 'User'} />
                    <AvatarFallback>
                      <UserCircle />
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user.displayName || user.email}</p>
                    {user.displayName && user.email && <p className="text-xs leading-none text-muted-foreground">{user.email}</p>}
                     {user.role && <p className="text-xs leading-none text-muted-foreground capitalize">{t('header.role')}: {user.role}</p>}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <LanguageIcon className="mr-2 h-4 w-4" />
                    <span>{t('header.language')}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                     <DropdownMenuRadioGroup value={locale} onValueChange={handleLanguageChange}>
                        <DropdownMenuRadioItem value="en">{t('header.english')}</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="hi">{t('header.hindi')}</DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive-foreground focus:bg-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  {t('header.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
             <Button asChild>
                <Link href="/login">{t('auth.login')}</Link>
             </Button>
          )}
           <div className="md:hidden">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-6 w-6" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full max-w-xs bg-card p-6">
                <div className="mb-6 flex items-center gap-2 text-lg font-semibold font-headline">
                  <Workflow className="h-7 w-7 text-primary" />
                  <span>TaskFlow</span>
                </div>
                <nav className="flex flex-col space-y-3">
                  <NavItems isMobile={true} />
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
