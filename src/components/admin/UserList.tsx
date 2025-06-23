
"use client";

import type { User as AppUser } from '@/types';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Edit2, Trash2, ShieldCheck, UserCog, UserIcon as DefaultUserIcon, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteUserDocument } from '@/services/userService';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';

interface UserListProps {
  users: AppUser[];
  onEditUser: (user: AppUser) => void;
  currentAdminUid: string;
  onUsersChanged: () => void;
}

export function UserList({ users, onEditUser, currentAdminUid, onUsersChanged }: UserListProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [deletingUid, setDeletingUid] = useState<string | null>(null);

  const handleDeleteUser = async (targetUserUid: string, targetUserDisplayName?: string) => {
    if (currentAdminUid === targetUserUid) {
      toast({ title: "Error", description: "Admin cannot delete their own user document.", variant: "destructive" });
      return;
    }
    setDeletingUid(targetUserUid);
    try {
      await deleteUserDocument(currentAdminUid, targetUserUid);
      toast({ title: "User Deleted", description: `User document for "${targetUserDisplayName || targetUserUid}" has been deleted.` });
      onUsersChanged(); // Refresh the list
    } catch (error: any) {
      toast({ title: "Deletion Failed", description: error.message || "Could not delete user document.", variant: "destructive" });
    } finally {
        setDeletingUid(null);
    }
  };
  
  const getRoleIcon = (role?: AppUser['role']) => {
    switch (role) {
      case 'admin': return <ShieldCheck className="h-4 w-4 text-red-500" />;
      case 'supervisor': return <UserCog className="h-4 w-4 text-blue-500" />;
      case 'member': return <DefaultUserIcon className="h-4 w-4 text-green-500" />;
      default: return <DefaultUserIcon className="h-4 w-4 text-muted-foreground" />;
    }
  };
  
  const getRoleBadgeVariant = (role?: AppUser['role']): "default" | "secondary" | "destructive" | "outline" => {
    switch (role) {
      case 'admin': return 'destructive';
      case 'supervisor': return 'default'; // using primary color for supervisor
      case 'member': return 'secondary';
      default: return 'outline';
    }
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-card p-10 text-center">
        <DefaultUserIcon className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-3 font-headline text-lg font-semibold">{t('users.noUsersFound')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('users.noUsersDesc')}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border shadow-sm bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('users.displayName')}</TableHead>
            <TableHead>{t('users.email')}</TableHead>
            <TableHead>{t('users.uid')}</TableHead>
            <TableHead>{t('users.role')}</TableHead>
            <TableHead className="text-right">{t('users.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user, index) => (
            <TableRow key={user.uid ?? `user-row-${index}`}>
              <TableCell className="font-medium">{user.displayName || 'N/A'}</TableCell>
              <TableCell>{user.email || 'N/A'}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{user.uid}</TableCell>
              <TableCell>
                <Badge variant={getRoleBadgeVariant(user.role)} className="capitalize flex items-center gap-1 w-fit">
                  {getRoleIcon(user.role)}
                  {user.role || 'N/A'}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" onClick={() => onEditUser(user)} title={t('users.editUser')}>
                  <Edit2 className="h-4 w-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" title={t('users.deleteUser')} disabled={currentAdminUid === user.uid}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('users.deleteUser')} "{user.displayName || user.uid}"?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('users.deleteUserWarning')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('projectDetails.cancel')}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDeleteUser(user.uid, user.displayName || undefined)}
                        className="bg-destructive hover:bg-destructive/90"
                        disabled={deletingUid === user.uid}
                      >
                        {deletingUid === user.uid && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('users.deleteDocument')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
