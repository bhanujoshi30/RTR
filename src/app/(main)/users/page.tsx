
"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { UserList } from '@/components/admin/UserList';
import { Button } from '@/components/ui/button';
import { UserForm, type UserFormValues } from '@/components/admin/UserForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, PlusCircle, Users as UsersIcon } from 'lucide-react';
import type { User as AppUser, UserRole } from '@/types';
import { upsertUserDocument, getAllUsers } from '@/services/userService';
import { useToast } from '@/hooks/use-toast';

const ADMIN_EMAIL = 'joshi1bhanu@gmail.com';

export default function UsersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [users, setUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [showUserFormModal, setShowUserFormModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);

  const isAdmin = user?.email === ADMIN_EMAIL;

  useEffect(() => {
    if (!authLoading) {
      if (!user || user.email !== ADMIN_EMAIL) {
        toast({ title: 'Access Denied', description: 'You do not have permission to view this page.', variant: 'destructive'});
        router.push('/dashboard');
      }
    }
  }, [user, authLoading, router, toast]);

  const fetchUsers = async () => {
    if (!user || !isAdmin) return;
    setLoadingUsers(true);
    setError(null);
    try {
      const fetchedUsers = await getAllUsers(user.uid);
      setUsers(fetchedUsers);
    } catch (err: any) {
      console.error("Error fetching users:", err);
      setError("Failed to load users. " + (err.message || ""));
      toast({ title: 'Error', description: 'Failed to load users. ' + err.message, variant: 'destructive' });
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (isAdmin && user) {
      fetchUsers();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, user]);


  const handleUserFormSuccess = () => {
    setShowUserFormModal(false);
    setEditingUser(null);
    fetchUsers(); // Refresh the list
  };

  const handleAddUserClick = () => {
    setEditingUser(null);
    setShowUserFormModal(true);
  };

  const handleEditUserClick = (userToEdit: AppUser) => {
    setEditingUser(userToEdit);
    setShowUserFormModal(true);
  };

  if (authLoading || (!isAdmin && !authLoading)) {
    return (
      <div className="flex h-[calc(100vh-10rem)] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  return (
    <div className="space-y-8">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="font-headline text-3xl font-semibold tracking-tight flex items-center">
          <UsersIcon className="mr-3 h-8 w-8 text-primary" />
          User Management
        </h1>
        <Button onClick={handleAddUserClick} disabled={loadingUsers}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      {loadingUsers && (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="ml-2 text-lg">Loading users...</p>
        </div>
      )}
      {error && <p className="text-center text-destructive py-4">{error}</p>}
      
      {!loadingUsers && !error && user && (
        <UserList 
          users={users} 
          onEditUser={handleEditUserClick} 
          currentAdminUid={user.uid}
          onUsersChanged={fetchUsers}
        />
      )}

      <Dialog open={showUserFormModal} onOpenChange={(isOpen) => {
        if (!isOpen) setEditingUser(null);
        setShowUserFormModal(isOpen);
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-headline text-xl">
              {editingUser ? 'Edit User' : 'Add New User'}
            </DialogTitle>
            <DialogDescription>
              {editingUser ? 'Modify the details of this user.' : "Enter the user's details. Ensure the UID matches an existing Firebase Auth user."}
            </DialogDescription>
          </DialogHeader>
          {user && (
            <UserForm
              adminUserUid={user.uid}
              existingUser={editingUser}
              onFormSuccess={handleUserFormSuccess}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
