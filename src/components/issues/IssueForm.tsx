
"use client";

import { useEffect, useState, type FormEvent, useRef } from 'react';
import { createIssue, updateIssue } from '@/services/issueService';
import { getTaskById, updateTask } from '@/services/taskService';
import type { Issue, IssueSeverity, IssueProgressStatus, User as AppUser, Task } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Save, Loader2, Users, X, ImagePlus, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { getAllUsers } from '@/services/userService';
import Image from 'next/image';
import { uploadAttachment, addAttachmentMetadata } from '@/services/attachmentService';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const issueSeverities: IssueSeverity[] = ['Normal', 'Critical'];

interface IssueFormProps {
  projectId: string;
  taskId: string; 
  issue?: Issue;
  onFormSuccess: () => void;
}

interface Location {
  latitude: number;
  longitude: number;
  address?: string;
}

export function IssueForm({ projectId, taskId, issue, onFormSuccess }: IssueFormProps) {
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  // Form State
  const [title, setTitle] = useState(issue?.title || '');
  const [description, setDescription] = useState(issue?.description || '');
  const [severity, setSeverity] = useState<IssueSeverity>(issue?.severity || 'Normal');
  const [dueDate, setDueDate] = useState<Date | undefined>(issue?.dueDate);
  
  // Member Assignment State
  const [assignedUsers, setAssignedUsers] = useState<AppUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  
  // Photo State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  
  // Control State
  const [loading, setLoading] = useState(false);
  const [parentSubTask, setParentSubTask] = useState<Task | null>(null);
  const [allAssignableUsers, setAllAssignableUsers] = useState<AppUser[]>([]);
  const [loadingAssignableUsers, setLoadingAssignableUsers] = useState(true);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Fetch location once on mount
     if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            let fetchedAddress = 'Address lookup failed.';
            try {
              const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`);
              if (!response.ok) throw new Error(`Geocoding failed`);
              const data = await response.json();
              fetchedAddress = data?.display_name || 'No address found for these coordinates.';
            } catch (error) {
              console.error("Reverse geocoding failed:", error);
            }
            setLocation({ latitude, longitude, address: fetchedAddress });
            setLocationError(null);
          },
          (error) => setLocationError(error.message)
        );
      } else {
        setLocationError("Geolocation is not supported by this browser.");
      }
  }, []);

  useEffect(() => {
    const fetchPrerequisites = async () => {
      if (!user || !taskId) return;
      setLoadingAssignableUsers(true);
      try {
        const fetchedParentTask = await getTaskById(taskId, user.uid, user.role);

        if (!fetchedParentTask) {
          toast({ title: "Error", description: "Parent sub-task not found.", variant: "destructive" });
          return;
        }
        setParentSubTask(fetchedParentTask);
        
        const assignableUsersMap = new Map<string, AppUser>();
        if (fetchedParentTask.ownerUid && fetchedParentTask.ownerName) {
            assignableUsersMap.set(fetchedParentTask.ownerUid, { uid: fetchedParentTask.ownerUid, displayName: fetchedParentTask.ownerName, email: null, photoURL: null });
        }
        if (fetchedParentTask.assignedToUids && fetchedParentTask.assignedToNames) {
            fetchedParentTask.assignedToUids.forEach((uid, index) => {
                const name = fetchedParentTask.assignedToNames?.[index];
                if (uid && name) assignableUsersMap.set(uid, { uid, displayName: name, email: null, photoURL: null });
            });
        }
        const sortedUsers = Array.from(assignableUsersMap.values()).sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
        setAllAssignableUsers(sortedUsers);

        if (issue?.assignedToUids) {
            const preAssignedUsers = sortedUsers.filter(u => issue.assignedToUids!.includes(u.uid));
            setAssignedUsers(preAssignedUsers);
        }

      } catch (error: any) {
        toast({ title: "Error loading form data", description: `Could not load parent task data. ${error.message}`, variant: "destructive" });
      } finally {
        setLoadingAssignableUsers(false);
      }
    };
    if (!authLoading && user) fetchPrerequisites();
  }, [taskId, user, authLoading, toast, issue]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleAddMember = () => {
    if (!selectedUserId) return;
    const userToAdd = allAssignableUsers.find(u => u.uid === selectedUserId);
    if (userToAdd && !assignedUsers.some(u => u.uid === selectedUserId)) {
      setAssignedUsers([...assignedUsers, userToAdd]);
      setSelectedUserId('');
    }
  };

  const handleRemoveMember = (uid: string) => {
    setAssignedUsers(assignedUsers.filter(u => u.uid !== uid));
  };
  
  const availableUsersToAssign = allAssignableUsers.filter(u => !assignedUsers.some(au => au.uid === u.uid));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !parentSubTask) {
      toast({ title: 'Error', description: 'User or parent task details are missing.', variant: 'destructive' });
      return;
    }
    if (!title || !dueDate) {
        toast({ title: 'Missing Fields', description: 'Title and Due Date are required.', variant: 'destructive'});
        return;
    }
    if (!issue && !selectedFile) {
        toast({ title: 'Photo Required', description: 'Please attach a photo to report a new issue.', variant: 'destructive'});
        return;
    }

    setLoading(true);
    
    // --- Photo Upload Logic ---
    if (selectedFile && canvasRef.current && previewUrl) {
        toast({ title: 'Processing photo...', description: 'Please wait.' });
        try {
            const image = await new Promise<HTMLImageElement>((resolve, reject) => {
                const img = new window.Image();
                img.onload = () => resolve(img);
                img.onerror = (err) => reject(new Error('Failed to load selected image.'));
                img.src = previewUrl;
            });
            
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Could not get canvas context.');

            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            context.drawImage(image, 0, 0);

            // Stamping logic
            const userStamp = user.displayName || user.email || 'Unknown User';
            const timeStamp = new Date().toLocaleString();
            const fullAddress = location?.address || 'Address data unavailable.';
            const textLines = [userStamp, timeStamp, fullAddress];
            
            const fontSize = Math.max(20, Math.round(canvas.width / 80));
            context.font = `bold ${fontSize}px Arial`;
            context.textAlign = 'right';
            context.textBaseline = 'bottom';
            
            // ... (Full stamping logic here) ...
             const padding = Math.round(fontSize * 0.75);
            const lineHeight = fontSize * 1.2;

            let maxWidth = 0;
            textLines.forEach(line => {
                const metrics = context.measureText(line);
                if (metrics.width > maxWidth) maxWidth = metrics.width;
            });
            
            const totalTextHeight = lineHeight * textLines.length;
            context.fillStyle = 'rgba(0, 0, 0, 0.6)';
            context.fillRect(
                canvas.width - maxWidth - padding * 2,
                canvas.height - totalTextHeight - (padding * 1.5),
                maxWidth + padding * 2,
                totalTextHeight + padding * 2
            );

            context.fillStyle = 'white';
            let currentY = canvas.height - padding;
            for (let i = textLines.length - 1; i >= 0; i--) {
                context.fillText(textLines[i], canvas.width - padding, currentY);
                currentY -= lineHeight;
            }

            const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.9));
            const filename = `issue-report-${Date.now()}.jpg`;
            const stampedFile = new File([blob], filename, { type: 'image/jpeg' });
            
            toast({ title: 'Uploading photo...' });
            const downloadURL = await uploadAttachment(taskId, stampedFile, () => {}); // Progress not shown here

            await addAttachmentMetadata({
                projectId,
                taskId,
                ownerUid: user.uid,
                ownerName: user.displayName || user.email || 'N/A',
                url: downloadURL,
                filename,
                reportType: 'issue-report',
                location: location || undefined,
            });

        } catch (error: any) {
            toast({ title: 'Photo Upload Failed', description: error.message, variant: 'destructive'});
            setLoading(false);
            return;
        }
    }

    // --- Issue Creation/Update Logic ---
    const issueDataPayload = { 
        title,
        description,
        severity,
        status: issue ? issue.status : 'Open' as IssueProgressStatus,
        dueDate,
        assignedToUids: assignedUsers.map(u => u.uid),
        assignedToNames: assignedUsers.map(u => u.displayName || u.email || 'N/A'),
    };

    try {
      if (issue) {
        await updateIssue(issue.id, user.uid, taskId, issueDataPayload);
        toast({ title: 'Issue Updated', description: `"${title}" has been updated.` });
      } else {
        const ownerName = user.displayName || user.email || 'Unknown User';
        await createIssue(projectId, taskId, user.uid, ownerName, issueDataPayload);
        toast({ title: 'Issue Created', description: `"${title}" has been added.` });

        if (parentSubTask.status === 'Completed') {
          await updateTask(taskId, user.uid, { status: 'In Progress' }, user.role);
          toast({ title: 'Task Status Updated', description: `Parent sub-task "${parentSubTask.name}" was automatically moved to 'In Progress'.` });
        }
      }
      onFormSuccess();
    } catch (error: any) {
      toast({ title: issue ? 'Update Failed' : 'Creation Failed', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="shadow-lg">
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6 pt-6">
          <div className="space-y-2">
            <label htmlFor="title" className="text-sm font-medium">Title</label>
            <Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Describe the issue" />
          </div>

          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium">Description (Optional)</label>
            <Textarea id="description" value={description} onChange={e => setDescription(e.target.value)} placeholder="More details about the issue" rows={3} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Photo Proof {issue ? '(Optional)' : '(Required)'}</label>
            <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handleFileChange} className="hidden" disabled={loading} />
            <Button type="button" variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()} disabled={loading}>
              <ImagePlus className="mr-2 h-4 w-4" />
              {selectedFile ? 'Change Photo' : 'Select Photo'}
            </Button>
            {previewUrl && (
                <div className="relative w-full aspect-video bg-muted rounded-md overflow-hidden flex items-center justify-center border">
                    <Image src={previewUrl} alt="Selected preview" fill className="object-contain" />
                </div>
            )}
            {!previewUrl && (
                <div className="w-full aspect-video bg-muted rounded-md flex flex-col items-center justify-center border border-dashed">
                    <ImagePlus className="h-12 w-12 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mt-2">Image preview will appear here</p>
                </div>
            )}
            {locationError && (
              <Alert variant="destructive" className="mt-2">
                <MapPin className="h-4 w-4" />
                <AlertTitle>Location Access Denied</AlertTitle>
                <AlertDescription>
                  {locationError} Stamping will proceed without location data.
                </AlertDescription>
              </Alert>
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Severity</label>
              <Select onValueChange={(val: IssueSeverity) => setSeverity(val)} value={severity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {issueSeverities.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Due Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dueDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dueDate} onSelect={setDueDate} />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          
          <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /> Assign To</label>
              <p className="text-sm text-muted-foreground">Select team members to assign this issue to.</p>
              {loadingAssignableUsers ? (
                  <p className="text-sm text-muted-foreground">Loading users...</p>
              ) : allAssignableUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No assignable users found for the parent task.</p>
              ) : (
                <>
                    <div className="flex gap-2">
                        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a user to add..."/>
                            </SelectTrigger>
                            <SelectContent>
                                {availableUsersToAssign.map(u => (
                                    <SelectItem key={u.uid} value={u.uid}>{u.displayName}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button type="button" onClick={handleAddMember} disabled={!selectedUserId}>Add</Button>
                    </div>
                    {assignedUsers.length > 0 && (
                        <div className="space-y-2 rounded-md border p-2">
                            <h4 className="text-xs font-semibold text-muted-foreground">Assigned:</h4>
                            <ul className="flex flex-wrap gap-2">
                                {assignedUsers.map(u => (
                                    <li key={u.uid} className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground">
                                        {u.displayName}
                                        <button type="button" onClick={() => handleRemoveMember(u.uid)} className="rounded-full hover:bg-muted p-0.5">
                                            <X className="h-3 w-3" />
                                            <span className="sr-only">Remove {u.displayName}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </>
              )}
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={loading || !user || loadingAssignableUsers}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {issue ? 'Save Changes' : 'Create Issue'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

    