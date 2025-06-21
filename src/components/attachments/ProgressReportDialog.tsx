
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
    if (!selectedFile || !canvasRef.current || !user) {
      toast({
        title: 'Error',
        description: 'Please select a photo to upload.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Could not get canvas context.');
      }

      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(new Error('Failed to load image for processing.'));
        img.src = URL.createObjectURL(selectedFile);
      });

      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      context.drawImage(image, 0, 0);

      const now = new Date();
      const timeStamp = now.toLocaleString();
      const locationStamp = location
        ? `Lat: ${location.latitude.toFixed(4)}, Lon: ${location.longitude.toFixed(4)}`
        : 'Location N/A';
      const userStamp = user.displayName || user.email || 'Unknown User';
      const fullStamp = `${userStamp} | ${timeStamp} | ${locationStamp}`;

      const fontSize = Math.max(16, Math.round(canvas.width / 60));
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

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('Could not create image blob from canvas.'));
        }, 'image/jpeg', 0.9); // Use JPEG for better compression
      });
      
      const filename = `${reportType}-${Date.now()}.jpg`;
      const stampedFile = new File([blob], filename, { type: 'image/jpeg' });
      
      const downloadURL = await uploadAttachment(
        taskId, 
        stampedFile,
        (progress) => setUploadProgress(progress)
      );

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

      // --- SUCCESS PATH ---
      toast({ title: 'Success', description: 'Report submitted successfully.' });
      setIsUploading(false); // Reset state BEFORE calling onSuccess
      setUploadProgress(null);
      onSuccess(); // Now it is safe to unmount the component

    } catch (error: any) {
      // --- FAILURE PATH ---
      console.error('Upload Error:', error);
      let description = 'An unexpected error occurred during the upload process.';
      if (error.message) {
        description = error.message;
      }
      if (error.code === 'storage/unknown' || error.code === 'storage/unauthorized') {
        description =
          'Upload failed due to a permission error. Please ensure Firebase Storage rules allow writes for authenticated users.';
      }
      toast({ title: 'Upload Failed', description, variant: 'destructive' });
      setIsUploading(false); // Reset state on any error
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
              capture="environment"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
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
              <p className="text-sm text-center text-muted-foreground">Uploading...</p>
              <Progress value={uploadProgress} className="w-full" />
            </div>
          )}

          {/* Canvas is hidden, used for processing only */}
          <canvas ref={canvasRef} className="hidden" />
        </div>
        <div className="flex justify-end gap-2">
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
