
"use client";

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { uploadAttachment, addAttachmentMetadata } from '@/services/attachmentService';
import { updateIssueStatus } from '@/services/issueService';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Loader2, Camera, Upload, MapPin, X, ImagePlus } from 'lucide-react';
import type { Issue, IssueProgressStatus } from '@/types';
import Image from 'next/image';
import { Progress } from '@/components/ui/progress';

interface IssueStatusChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issue: Issue | null;
  newStatus: IssueProgressStatus | null;
  onSuccess: () => void;
}

interface Location {
  latitude: number;
  longitude: number;
  address?: string;
}

export function IssueStatusChangeDialog({ open, onOpenChange, issue, newStatus, onSuccess }: IssueStatusChangeDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [comments, setComments] = useState('');
  const [location, setLocation] = useState<Location | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      // Reset state when dialog opens
      setComments('');
      setSelectedFile(null);
      setPreviewUrl(null);
      setLocation(null);
      setLocationError(null);
      setIsSubmitting(false);
      setUploadProgress(null);
      setFormError(null);

      // Fetch location
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
    } else {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(file));
      if (formError) setFormError(null);
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile || !comments.trim() || !issue || !newStatus || !user) {
      setFormError("A photo and comments are required to change the issue status.");
      toast({ title: 'Missing Information', description: formError, variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    setUploadProgress(0);
    setFormError(null);

    try {
      // Step 1: Stamp image
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(new Error('Failed to load selected image.'));
        img.src = previewUrl!;
      });

      const canvas = canvasRef.current!;
      const context = canvas.getContext('2d')!;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      context.drawImage(image, 0, 0);

      const now = new Date();
      const timeStamp = now.toLocaleString();
      const userStamp = user.displayName || user.email || 'Unknown User';
      const infoLine1 = `${userStamp} | ${timeStamp}`;
      const coords = location ? `(Lat: ${location.latitude.toFixed(4)}, Lon: ${location.longitude.toFixed(4)})` : '';
      const infoLine2 = `${location?.address || 'Location N/A'} ${coords}`.trim();
      const fontSize = Math.max(20, Math.round(canvas.width / 75));
      context.font = `bold ${fontSize}px Arial`;
      context.textAlign = 'right';
      context.textBaseline = 'bottom';
      const padding = Math.round(fontSize * 0.75);
      const lineHeight = fontSize * 1.2;
      const maxWidth = Math.max(context.measureText(infoLine1).width, context.measureText(infoLine2).width);
      context.fillStyle = 'rgba(0, 0, 0, 0.6)';
      context.fillRect(canvas.width - maxWidth - padding * 2, canvas.height - (lineHeight * 2) - (padding * 1.5), maxWidth + padding * 2, (lineHeight * 2) + padding);
      context.fillStyle = 'white';
      context.fillText(infoLine2, canvas.width - padding, canvas.height - padding);
      context.fillText(infoLine1, canvas.width - padding, canvas.height - padding - lineHeight);
      
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.9));
      const filename = `issue-proof-${Date.now()}.jpg`;
      const stampedFile = new File([blob], filename, { type: 'image/jpeg' });

      // Step 2: Upload stamped file
      toast({ title: 'Uploading proof...', description: 'Your photo is being submitted.' });
      const downloadURL = await uploadAttachment(issue.taskId, stampedFile, (progress) => setUploadProgress(progress));

      // Step 3: Update issue status with proof
      await updateIssueStatus(issue.id, user.uid, newStatus, user.role, {
        comments,
        attachment: {
          url: downloadURL,
          filename: filename,
          reportType: 'issue-update-proof',
          location: location || undefined
        }
      });
      
      toast({ title: 'Success!', description: `Issue status changed to ${newStatus}.` });
      onSuccess();
    } catch (error: any) {
      toast({ title: 'Submission Failed', description: error.message || 'An unexpected error occurred.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline text-xl">Change Issue Status to "{newStatus}"</DialogTitle>
          <DialogDescription>A photo and comments are required as proof for this status change.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
           <div className="grid w-full gap-1.5">
            <Label htmlFor="comments">Comments (Required)</Label>
            <Textarea 
              placeholder="Explain the reason for this status change..." 
              id="comments" 
              value={comments} 
              onChange={(e) => { setComments(e.target.value); if (formError) setFormError(null); }}
              disabled={isSubmitting}
            />
          </div>
          {locationError && (
            <Alert variant="destructive">
              <MapPin className="h-4 w-4" />
              <AlertTitle>Location Access Denied</AlertTitle>
              <AlertDescription>{locationError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
             <Label>Photo Proof (Required)</Label>
            <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handleFileChange} className="hidden" disabled={isSubmitting}/>
            <Button variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()} disabled={isSubmitting}>
              <Camera className="mr-2 h-4 w-4" />
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
          </div>
          
           {isSubmitting && uploadProgress !== null && (
            <div className="space-y-1 pt-2">
              <p className="text-sm text-center text-muted-foreground">Uploading... {Math.round(uploadProgress)}%</p>
              <Progress value={uploadProgress} className="w-full" />
            </div>
          )}
          
          {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}

          <canvas ref={canvasRef} className="hidden" />
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            <X className="mr-2 h-4 w-4" /> Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Submit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
