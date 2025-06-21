
"use client";

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { uploadAttachment, addAttachmentMetadata } from '@/services/attachmentService';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Loader2, Camera, Upload, MapPin, X, ImagePlus } from 'lucide-react';
import type { User } from '@/types';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { Progress } from '@/components/ui/progress';

interface ProgressReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  projectId: string;
  reportType: 'daily-progress' | 'completion-proof';
  onSuccess: () => void;
}

interface Location {
  latitude: number;
  longitude: number;
}

export function ProgressReportDialog({ open, onOpenChange, taskId, projectId, reportType, onSuccess }: ProgressReportDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [location, setLocation] = useState<Location | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);


  useEffect(() => {
    // Reset state when dialog opens
    if (open) {
      setSelectedFile(null);
      setPreviewUrl(null);
      setLocation(null);
      setLocationError(null);
      setIsUploading(false);
      setUploadProgress(null); 

      // Fetch location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setLocation({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
            setLocationError(null);
          },
          (error) => {
            setLocationError(error.message);
            console.error('Error getting location:', error);
          }
        );
      } else {
        setLocationError("Geolocation is not supported by this browser.");
      }
    } else {
      // Cleanup preview URL to prevent memory leaks
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);


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

  const handleUpload = async () => {
    if (!selectedFile || !canvasRef.current || !user || !previewUrl) {
      toast({ title: 'Error', description: 'Please select a photo to upload.', variant: 'destructive' });
      return;
    }
    
    setIsUploading(true);
    setUploadProgress(0);

    try {
      toast({ title: 'Processing...', description: 'Preparing your image.' });

      // 1. Load image from preview URL
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load selected image. It might be corrupt.'));
        img.src = previewUrl;
      });

      // 2. Draw image and metadata on canvas
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) {
          throw new Error('Could not prepare image for upload. Canvas context is unavailable.');
      }
      
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      context.drawImage(image, 0, 0);

      const now = new Date();
      const timeStamp = now.toLocaleString();
      const locationStamp = location ? `Lat: ${location.latitude.toFixed(4)}, Lon: ${location.longitude.toFixed(4)}` : 'Location N/A';
      const userStamp = user.displayName || user.email || 'Unknown User';
      const fullStamp = `${userStamp} | ${timeStamp} | ${locationStamp}`;

      const fontSize = Math.max(24, Math.round(canvas.width / 50));
      context.font = `bold ${fontSize}px Arial`;
      context.textAlign = 'right';
      context.textBaseline = 'bottom';
      const textMetrics = context.measureText(fullStamp);
      const padding = Math.round(fontSize * 0.75);
      
      context.fillStyle = 'rgba(0, 0, 0, 0.6)';
      context.fillRect(
        canvas.width - textMetrics.width - padding * 2,
        canvas.height - fontSize - padding * 2,
        textMetrics.width + padding * 2,
        fontSize + padding * 2
      );
      context.fillStyle = 'white';
      context.fillText(fullStamp, canvas.width - padding, canvas.height - padding);

      // 3. Get stamped image as a Blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Could not convert canvas to image blob.')), 'image/jpeg', 0.9);
      });
      
      const filename = `${reportType}-${Date.now()}.jpg`;
      const stampedFile = new File([blob], filename, { type: 'image/jpeg' });
      
      // 4. Upload stamped file
      toast({ title: 'Uploading...', description: 'Your report is being submitted.' });
      const downloadURL = await uploadAttachment(taskId, stampedFile, (progress) => setUploadProgress(progress));
      
      // 5. Save metadata to Firestore
      await addAttachmentMetadata({
        projectId,
        taskId,
        ownerUid: user.uid,
        ownerName: user.displayName || user.email || 'N/A',
        url: downloadURL,
        filename,
        reportType,
        location: location || undefined,
      });

      // --- SUCCESS ---
      toast({ title: 'Success!', description: 'Report submitted successfully.' });
      setIsUploading(false); // Reset state
      setUploadProgress(null);
      onSuccess(); // Then close dialog

    } catch (error: any) {
      // --- FAILURE ---
      console.error('Upload Error:', error);
      toast({
        title: 'Upload Failed',
        description: error.message || 'An unexpected error occurred during the submission process.',
        variant: 'destructive',
      });
      setIsUploading(false); // Reset state on error
      setUploadProgress(null);
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline text-xl capitalize">{reportType.replace('-', ' ')} Submission</DialogTitle>
          <DialogDescription>
            Select a photo as proof. Your name, time, and location will be stamped on the image.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {locationError && (
            <Alert variant="destructive">
              <MapPin className="h-4 w-4" />
              <AlertTitle>Location Access Denied</AlertTitle>
              <AlertDescription>
                {locationError} Stamping will proceed without location data.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <input
              type="file"
              accept="image/*"
              capture="user"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              disabled={isUploading}
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <Camera className="mr-2 h-4 w-4" />
              {selectedFile ? 'Change Photo' : 'Select Photo'}
            </Button>
            {previewUrl && (
              <div className="relative w-full aspect-square bg-muted rounded-md overflow-hidden flex items-center justify-center border">
                <Image
                  src={previewUrl}
                  alt="Selected preview"
                  layout="fill"
                  objectFit="contain"
                />
              </div>
            )}
             {!previewUrl && (
              <div className="w-full aspect-square bg-muted rounded-md flex flex-col items-center justify-center border border-dashed">
                <ImagePlus className="h-12 w-12 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-2">Image preview will appear here</p>
              </div>
            )}
          </div>
          
           {isUploading && uploadProgress !== null && (
            <div className="space-y-1 pt-2">
              <p className="text-sm text-center text-muted-foreground">Uploading... {Math.round(uploadProgress)}%</p>
              <Progress value={uploadProgress} className="w-full" />
            </div>
          )}

          {/* Canvas is hidden, used for processing only */}
          <canvas ref={canvasRef} className="hidden" />
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUploading}>
            <X className="mr-2 h-4 w-4" /> Cancel
          </Button>
          <Button onClick={handleUpload} disabled={!selectedFile || isUploading}>
            {isUploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Submit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
