
"use client";

import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { User as AppUser, UserRole } from '@/types';
import { upsertUserDocument, type UserDocumentData } from '@/services/userService';
import { useState } from 'react';

const userRoles: UserRole[] = ['admin', 'supervisor', 'member'];

const userFormSchema = z.object({
  uid: z.string().min(1, { message: "Firebase UID is required." }),
  displayName: z.string().min(2, { message: "Display name must be at least 2 characters." }).max(50),
  email: z.string().email({ message: "Invalid email address." }),
  role: z.enum(userRoles, { required_error: "Role is required." }),
  photoURL: z.string().url({ message: "Invalid URL for photo." }).optional().or(z.literal('')),
});

export type UserFormValues = z.infer<typeof userFormSchema>;

interface UserFormProps {
  adminUserUid: string; // UID of the admin performing the action
  existingUser?: AppUser | null;
  onFormSuccess: () => void;
}

export function UserForm({ adminUserUid, existingUser, onFormSuccess }: UserFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      uid: existingUser?.uid || '',
      displayName: existingUser?.displayName || '',
      email: existingUser?.email || '',
      role: existingUser?.role || 'member',
      photoURL: existingUser?.photoURL || '',
    },
  });

  const onSubmit: SubmitHandler<UserFormValues> = async (data) => {
    setLoading(true);
    try {
      const userDataPayload: UserDocumentData = {
        uid: data.uid,
        displayName: data.displayName,
        email: data.email,
        role: data.role,
        photoURL: data.photoURL || null,
      };
      await upsertUserDocument(adminUserUid, userDataPayload);
      toast({
        title: existingUser ? 'User Updated' : 'User Added',
        description: `User "${data.displayName}" has been ${existingUser ? 'updated' : 'added'}.`,
      });
      onFormSuccess();
    } catch (error: any) {
      toast({
        title: 'Operation Failed',
        description: error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="uid"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Firebase UID</FormLabel>
              <FormControl>
                <Input 
                  placeholder="Enter Firebase Authentication UID" 
                  {...field} 
                  disabled={!!existingUser} // UID cannot be changed for existing user
                />
              </FormControl>
              <FormMessage />
              { !existingUser && <p className="text-xs text-muted-foreground pt-1">This UID must match an existing Firebase Authentication user.</p> }
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Display Name</FormLabel>
              <FormControl>
                <Input placeholder="E.g., John Doe" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="user@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
         <FormField
          control={form.control}
          name="photoURL"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Photo URL (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="https://example.com/photo.jpg" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {userRoles.map(role => (
                    <SelectItem key={role} value={role} className="capitalize">{role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {existingUser ? 'Save Changes' : 'Add User Document'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
