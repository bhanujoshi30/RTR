
"use client";

import { useEffect, useState, useRef } from 'react';
import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createIssue, updateIssue } from '@/services/issueService';
import { getTaskById, updateTask } from '@/services/taskService';
import { uploadAttachment, addAttachmentMetadata } from '@/services/attachmentService';
import type { Issue, IssueSeverity, IssueProgressStatus, User as AppUser, Task } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { CalendarIcon, Save, Loader2, Users, AlertCircle, Camera, ImagePlus, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import Image from 'next/image';

interface Location {
  latitude: number;
  longitude: number;
  address?: string;
}

const issueSeverities: IssueSeverity[] = ['Normal', 'Critical'];
const issueProgressStatuses: IssueProgressStatus[] = ['Open', 'Closed'];

const issueSchema = z.object({
  title: z.string().min(3, { message: 'Issue title must be at least 3 characters' }).max(150),
  description: z.string().max(1000).optional(),
  severity: z.enum(issueSeverities),
  status: z.enum(issueProgressStatuses),
  assignedToUids: z.array(z.string()).optional().default([]),
  dueDate: z.date({ required_error: "Due date is required." }),
});

type IssueFormValues = z.infer<typeof issueSchema>;

interface IssueFormProps {
  projectId: string;
  taskId: string; // This is the parent SubTask ID
  issue?: Issue;
  onFormSuccess: () => void;
}

export function IssueForm({ projectId, taskId, issue, onFormSuccess }: IssueFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const [assignableUsersForIssue, setAssignableUsersForIssue] = useState<AppUser[]>([]);
  const [parentSubTask, setParentSubTask] = useState<Task | null>(null);
  const [loadingAssignableUsers, setLoadingAssignableUsers] = useState(true);

  // State for photo upload
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const form = useForm<IssueFormValues>({
    resolver: zodResolver(issueSchema),
    defaultValues: {
      title: issue?.title || '',
      description: issue?.description || '',
      severity: issue?.severity || 'Normal',
      status: issue?.status || 'Open',
      assignedToUids: issue?.assignedToUids || [],
      dueDate: issue?.dueDate || undefined,
    },
  });

  // Effect for fetching prerequisites (users, parent task)
  useEffect(() => {
    const fetchPrerequisites = async () => {
      if (!user || !taskId) return;
      setLoadingAssignableUsers(true);
      try {
        const fetchedParentTask = await getTaskById(taskId, user.uid, user.role);

        if (!fetchedParentTask) {
          toast({ title: "Error", description: "Parent sub-task not found.", variant: "destructive" });
          setLoadingAssignableUsers(false);
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
        setAssignableUsersForIssue(sortedUsers);
      } catch (error: any) {
        console.error("Failed to fetch prerequisites for IssueForm:", error);
        toast({ title: "Error loading form data", description: `Could not load parent task data. ${error.message}`, variant: "destructive" });
        setAssignableUsersForIssue([]);
      } finally {
        setLoadingAssignableUsers(false);
      }
    };
    if (!authLoading && user) fetchPrerequisites();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, user, authLoading, toast]);
  
  // Effect for getting location, only for new issues
  useEffect(() => {
      if (issue) return; // Don't run for existing issues

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            let fetchedAddress = 'Address lookup failed.';
            try {
              const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`);
              if (!response.ok) throw new Error(`Geocoding service failed`);
              const data = await response.json();
              fetchedAddress = data?.display_name || 'No address found.';
            } catch (error) { console.error("Reverse geocoding failed:", error); }
            setLocation({ latitude, longitude, address: fetchedAddress });
          },
          (error) => setLocationError(error.message)
        );
      } else {
        setLocationError("Geolocation is not supported by this browser.");
      }
  }, [issue]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const onSubmit: SubmitHandler<IssueFormValues> = async (data) => {
    if (!user || !parentSubTask) {
      toast({ title: 'Error', description: 'User or parent task details are missing. Cannot proceed.', variant: 'destructive' });
      return;
    }
    
    // For new issues, photo is mandatory
    if (!issue && !selectedFile) {
        toast({ title: 'Photo Required', description: 'A photo is required to report a new issue.', variant: 'destructive' });
        return;
    }

    setLoading(true);

    let photoURLForAttachment: string | null = null;
    let filenameForAttachment: string | null = null;

    // Upload photo only for new issues
    if (!issue && selectedFile && canvasRef.current && previewUrl) {
      try {
        toast({ title: 'Processing...', description: 'Preparing your image.' });
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new window.Image();
          img.onload = () => resolve(img);
          img.onerror = (err) => reject(new Error('Failed to load selected image.'));
          img.src = previewUrl;
        });

        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not prepare image for upload.');
        
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        context.drawImage(image, 0, 0);

        const userStamp = user.displayName || user.email || 'Unknown User';
        const timeStamp = new Date().toLocaleString();
        const coords = location ? `Lat: ${location.latitude.toFixed(4)}, Lon: ${location.longitude.toFixed(4)}` : 'Coordinates unavailable';
        const fullAddress = location?.address || 'Address data unavailable.';
        let addressLine1 = fullAddress;
        let addressLine2 = '';
        const midPoint = Math.floor(fullAddress.length / 2);
        const splitIndex = fullAddress.indexOf(',', midPoint);
        if (splitIndex !== -1) {
          addressLine1 = fullAddress.substring(0, splitIndex).trim();
          addressLine2 = fullAddress.substring(splitIndex + 1).trim();
        }
        const textLines = [userStamp, timeStamp, coords, addressLine1];
        if (addressLine2) textLines.push(addressLine2);

        const fontSize = Math.max(20, Math.round(canvas.width / 80));
        context.font = `bold ${fontSize}px Arial`;
        context.textAlign = 'right';
        context.textBaseline = 'bottom';
        const padding = Math.round(fontSize * 0.75);
        const lineHeight = fontSize * 1.2;
        let maxWidth = 0;
        textLines.forEach(line => {
          const metrics = context.measureText(line);
          if (metrics.width > maxWidth) maxWidth = metrics.width;
        });
        const totalTextHeight = lineHeight * textLines.length;
        context.fillStyle = 'rgba(0, 0, 0, 0.6)';
        context.fillRect(canvas.width - maxWidth - padding * 2, canvas.height - totalTextHeight - (padding * 1.5), maxWidth + padding * 2, totalTextHeight + padding * 2);
        context.fillStyle = 'white';
        let currentY = canvas.height - padding;
        for (let i = textLines.length - 1; i >= 0; i--) {
          context.fillText(textLines[i], canvas.width - padding, currentY);
          currentY -= lineHeight;
        }
        
        const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.9));
        const filename = `issue-report-${Date.now()}.jpg`;
        const stampedFile = new File([blob], filename, { type: 'image/jpeg' });
        
        toast({ title: 'Uploading...', description: 'Your report is being submitted.' });
        const downloadURL = await uploadAttachment(taskId, stampedFile, (progress) => setUploadProgress(progress));

        photoURLForAttachment = downloadURL;
        filenameForAttachment = filename;
      } catch (error: any) {
        toast({ title: 'Upload Failed', description: error.message || 'An unexpected error occurred.', variant: 'destructive' });
        setLoading(false);
        return;
      }
    }

    let assignedToNamesForPayload: string[] | undefined = undefined;
    if (data.assignedToUids && data.assignedToUids.length > 0) {
      assignedToNamesForPayload = data.assignedToUids.map(uid => {
        const assignedUser = assignableUsersForIssue.find(u => u.uid === uid);
        return assignedUser?.displayName || uid;
      });
    }

    const issueDataPayload = { ...data, assignedToUids: data.assignedToUids || [], assignedToNames: assignedToNamesForPayload || [], dueDate: data.dueDate };

    try {
      if (issue) {
        await updateIssue(issue.id, user.uid, taskId, issueDataPayload);
        toast({ title: 'Issue Updated', description: `"${data.title}" has been updated.` });
      } else {
        const ownerName = user.displayName || user.email || 'Unknown User';
        const newIssueId = await createIssue(projectId, taskId, user.uid, ownerName, issueDataPayload);
        toast({ title: 'Issue Created', description: `"${data.title}" has been added.` });

        if (photoURLForAttachment && filenameForAttachment) {
            await addAttachmentMetadata({
                projectId, taskId, ownerUid: user.uid, ownerName, url: photoURLForAttachment,
                filename: filenameForAttachment, reportType: 'issue-report', location: location || undefined,
            });
        }

        if (parentSubTask.status === 'Completed') {
          await updateTask(taskId, user.uid, { status: 'In Progress' }, user.role);
          toast({ title: 'Task Status Updated', description: `Parent sub-task "${parentSubTask.name}" was automatically moved to 'In Progress'.` });
        }
      }
      
      const finalAssigneeUids = data.assignedToUids || [];
      if (finalAssigneeUids.length > 0) {
        const parentTaskAssigneeUids = parentSubTask.assignedToUids || [];
        const newUidsToAdd = finalAssigneeUids.filter(uid => !parentTaskAssigneeUids.includes(uid));

        if (newUidsToAdd.length > 0) {
          const newNamesToAdd = newUidsToAdd.map(uid => assignableUsersForIssue.find(u => u.uid === uid)?.displayName || uid);
          await updateTask(taskId, user.uid, {
            assignedToUids: [...parentTaskAssigneeUids, ...newUidsToAdd],
            assignedToNames: [...(parentSubTask.assignedToNames || []), ...newNamesToAdd],
          }, user.role);
          toast({ title: "Parent Task Updated", description: "New assignees were added to the parent sub-task." });
        }
      }
      onFormSuccess();
    } catch (error: any) {
      toast({ title: issue ? 'Update Failed' : 'Creation Failed', description: error.message || 'An unexpected error occurred.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField control={form.control} name="title" render={({ field }) => ( <FormItem> <FormLabel>Title</FormLabel> <FormControl> <Input placeholder="Describe the issue" {...field} /> </FormControl> <FormMessage /> </FormItem> )} />
        <FormField control={form.control} name="description" render={({ field }) => ( <FormItem> <FormLabel>Description (Optional)</FormLabel> <FormControl> <Textarea placeholder="More details about the issue" {...field} value={field.value ?? ''} rows={3} /> </FormControl> <FormMessage /> </FormItem> )} />
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <FormField control={form.control} name="severity" render={({ field }) => ( <FormItem> <FormLabel>Severity</FormLabel> <Select onValueChange={field.onChange} defaultValue={field.value}> <FormControl> <SelectTrigger> <SelectValue placeholder="Select severity" /> </SelectTrigger> </FormControl> <SelectContent> {issueSeverities.map(s => ( <SelectItem key={s} value={s}>{s}</SelectItem> ))} </SelectContent> </Select> <FormMessage /> </FormItem> )} />
          <FormField control={form.control} name="status" render={({ field }) => ( <FormItem> <FormLabel>Status</FormLabel> <Select onValueChange={field.onChange} defaultValue={field.value}> <FormControl> <SelectTrigger> <SelectValue placeholder="Select status" /> </SelectTrigger> </FormControl> <SelectContent> {issueProgressStatuses.map(s => ( <SelectItem key={s} value={s}>{s}</SelectItem> ))} </SelectContent> </Select> <FormMessage /> </FormItem> )} />
        </div>
        
         <FormField
          control={form.control}
          name="assignedToUids"
          render={({ field }) => (
            <FormItem>
              <div className="mb-2">
                <FormLabel className="flex items-center">
                  <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                  Assign To (Team Members)
                </FormLabel>
                <FormDescription>
                  Select team members to assign this issue to.
                </FormDescription>
              </div>

              {loadingAssignableUsers && ( <p className="text-sm text-muted-foreground">Loading...</p> )}

              {!loadingAssignableUsers && assignableUsersForIssue.length === 0 && (
                <div className="p-3 text-sm text-muted-foreground border rounded-md flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-500" /> No assignable team members found.
                </div>
              )}
              
              <div className="space-y-2 rounded-md border p-4 max-h-48 overflow-y-auto">
                {assignableUsersForIssue.map((item) => (
                  <FormItem
                    key={item.uid}
                    className="flex flex-row items-start space-x-3 space-y-0"
                  >
                    <FormControl>
                      <Checkbox
                        checked={field.value?.includes(item.uid)}
                        onCheckedChange={(checked) => {
                          return checked
                            ? field.onChange([...(field.value || []), item.uid])
                            : field.onChange(
                                (field.value || []).filter(
                                  (value) => value !== item.uid
                                )
                              )
                        }}
                      />
                    </FormControl>
                    <FormLabel className="text-sm font-normal">
                      {item.displayName || item.email} ({item.role})
                    </FormLabel>
                  </FormItem>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />


        <FormField control={form.control} name="dueDate" render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>Due Date</FormLabel>
            <Popover>
              <PopoverTrigger asChild> <FormControl> <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}> <CalendarIcon className="mr-2 h-4 w-4" /> {field.value ? format(field.value, "PPP") : <span>Pick a date</span>} </Button> </FormControl> </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start"> <Calendar mode="single" selected={field.value || undefined} onSelect={field.onChange} /> </PopoverContent>
            </Popover>
            <FormMessage />
          </FormItem>
        )} />

        {!issue && (
            <FormItem>
              <FormLabel>Photo Proof (Required)</FormLabel>
              <div className="space-y-2">
                {locationError && ( <Alert variant="destructive"> <MapPin className="h-4 w-4" /> <AlertTitle>Location Access Denied</AlertTitle> <AlertDescription> {locationError} Stamping will proceed without location data. </AlertDescription> </Alert> )}
                <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handleFileChange} className="hidden" disabled={loading} />
                <Button type="button" variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()} disabled={loading}> <Camera className="mr-2 h-4 w-4" /> {selectedFile ? 'Change Photo' : 'Select Photo'} </Button>
                {previewUrl && ( <div className="relative w-full aspect-video bg-muted rounded-md overflow-hidden flex items-center justify-center border"> <Image src={previewUrl} alt="Selected preview" fill className="object-contain" /> </div> )}
                {!previewUrl && ( <div className="w-full aspect-video bg-muted rounded-md flex flex-col items-center justify-center border border-dashed"> <ImagePlus className="h-12 w-12 text-muted-foreground" /> <p className="text-sm text-muted-foreground mt-2">Image preview will appear here</p> </div> )}
              </div>
               {loading && uploadProgress !== null && ( <div className="space-y-1 pt-2"> <p className="text-sm text-center text-muted-foreground">Uploading... {Math.round(uploadProgress)}%</p> <Progress value={uploadProgress} className="w-full" /> </div> )}
            </FormItem>
        )}

        <canvas ref={canvasRef} className="hidden" />

        <div className="flex justify-end">
          <Button type="submit" disabled={loading || !user || loadingAssignableUsers}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {issue ? 'Save Changes' : 'Create Issue'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
