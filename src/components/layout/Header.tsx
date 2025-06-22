
"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LogOut, UserCircle, LayoutDashboard, FolderPlus, Menu, Workflow, Users } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useState } from 'react';

export function Header() {
  const { user } = useAuth();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      // Handle logout error (e.g., show toast)
    }
  };

  const isSupervisor = user?.role === 'supervisor';
  const isMember = user?.role === 'member';
  const isAdmin = user?.role === 'admin';
  const isClient = user?.role === 'client';

  const baseNavLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="mr-2 h-4 w-4" /> },
  ];

  const conditionalNavLinks = [];
  // "New Project" link hidden for supervisors, members, and clients
  if (user && !isSupervisor && !isMember && !isClient) { 
    conditionalNavLinks.push({ href: '/projects/create', label: 'New Project', icon: <FolderPlus className="mr-2 h-4 w-4" /> });
  }
  if (isAdmin) { // "Users" tab only for admin
    conditionalNavLinks.push({ href: '/users', label: 'Users', icon: <Users className="mr-2 h-4 w-4" /> });
  }
  
  const navLinks = [...baseNavLinks, ...conditionalNavLinks];


  const NavItems = ({isMobile = false} : {isMobile?: boolean}) => (
    <>
      {navLinks.map((link) => (
        <Button variant="ghost" asChild key={link.href} onClick={() => isMobile && setMobileMenuOpen(false)}>
          <Link href={link.href} className={`flex items-center ${isMobile ? 'justify-start w-full text-lg py-3' : ''}`}>
            {link.icon}
            {link.label}
          </Link>
        </Button>
      ))}
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
                     {user.role && <p className="text-xs leading-none text-muted-foreground capitalize">Role: {user.role}</p>}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive-foreground focus:bg-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
             <Button asChild>
                <Link href="/login">Log In</Link>
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
