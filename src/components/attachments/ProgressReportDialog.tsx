
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
import { useTranslation } from '@/hooks/useTranslation';

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
  address?: string;
}

export function ProgressReportDialog({ open, onOpenChange, taskId, projectId, reportType, onSuccess }: ProgressReportDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [location, setLocation] = useState<Location | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isFetchingLocation, setIsFetchingLocation] = useState(true);


  useEffect(() => {
    // Reset state when dialog opens
    if (open) {
      setSelectedFile(null);
      setPreviewUrl(null);
      setLocation(null);
      setLocationError(null);
      setIsUploading(false);
      setUploadProgress(null);
      setIsFetchingLocation(true);

      // Fetch location and address
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            let fetchedAddress = 'Address lookup failed.';
            try {
              // Using OpenStreetMap's free Nominatim service for reverse geocoding
              const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`);
              if (!response.ok) {
                  throw new Error(`Geocoding service returned status ${response.status}`);
              }
              const data = await response.json();
              if (data && data.display_name) {
                fetchedAddress = data.display_name;
              } else {
                fetchedAddress = 'No address found for these coordinates.';
              }
            } catch (error) {
              console.error("Reverse geocoding failed:", error);
            }

            setLocation({
              latitude,
              longitude,
              address: fetchedAddress,
            });
            setLocationError(null);
            setIsFetchingLocation(false);
          },
          (error) => {
            setLocationError(error.message);
            setIsFetchingLocation(false);
            console.error('Error getting location:', error);
          }
        );
      } else {
        setLocationError("Geolocation is not supported by this browser.");
        setIsFetchingLocation(false);
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
    
    if (!location) {
        toast({
            title: t('location.requiredTitle'),
            description: t('location.requiredDesc'),
            variant: 'destructive'
        });
        return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      console.log("Upload Step 1: Starting process...");
      toast({ title: 'Processing...', description: 'Preparing your image.' });

      // Step 1: Load image from preview URL
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        console.log("Upload Step 2: Creating Image object from preview URL.");
        const img = new window.Image();
        img.onload = () => {
           console.log("Upload Step 3: Image loaded successfully.");
           resolve(img);
        };
        img.onerror = (err) => {
          console.error("Upload Step 3.1: Image failed to load.", err);
          reject(new Error('Failed to load selected image. It might be corrupt.'));
        };
        img.src = previewUrl;
      });

      // Step 2: Draw image and metadata on canvas
      console.log("Upload Step 4: Getting canvas and context.");
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) {
          throw new Error('Could not prepare image for upload. Canvas context is unavailable.');
      }
      
      console.log("Upload Step 5: Drawing image and metadata to canvas.");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      context.drawImage(image, 0, 0);

      // --- New Stamping Logic Start ---
      const userStamp = user.displayName || user.email || 'Unknown User';
      const timeStamp = new Date().toLocaleString();
      const coords = `Lat: ${location.latitude.toFixed(4)}, Lon: ${location.longitude.toFixed(4)}`;
      const fullAddress = location?.address || 'Address data unavailable.';

      let addressLine1 = fullAddress;
      let addressLine2 = '';
      
      // Split address logic: find the first comma after the halfway point.
      const midPoint = Math.floor(fullAddress.length / 2);
      const splitIndex = fullAddress.indexOf(',', midPoint);

      if (splitIndex !== -1) {
        addressLine1 = fullAddress.substring(0, splitIndex);
        addressLine2 = fullAddress.substring(splitIndex + 1).trim();
      }

      const textLines = [
        userStamp,
        timeStamp,
        coords,
        addressLine1,
      ];
      if (addressLine2) {
        textLines.push(addressLine2);
      }

      const fontSize = Math.max(20, Math.round(canvas.width / 80)); // Slightly smaller font for more lines
      context.font = `bold ${fontSize}px Arial`;
      context.textAlign = 'right';
      context.textBaseline = 'bottom';
      
      const padding = Math.round(fontSize * 0.75);
      const lineHeight = fontSize * 1.2;

      let maxWidth = 0;
      textLines.forEach(line => {
        const metrics = context.measureText(line);
        if (metrics.width > maxWidth) {
          maxWidth = metrics.width;
        }
      });
      
      // Draw background
      const totalTextHeight = lineHeight * textLines.length;
      context.fillStyle = 'rgba(0, 0, 0, 0.6)';
      context.fillRect(
        canvas.width - maxWidth - padding * 2,
        canvas.height - totalTextHeight - (padding * 1.5),
        maxWidth + padding * 2,
        totalTextHeight + padding
      );

      // Draw text from bottom up
      context.fillStyle = 'white';
      let currentY = canvas.height - padding;
      for (let i = textLines.length - 1; i >= 0; i--) {
        context.fillText(textLines[i], canvas.width - padding, currentY);
        currentY -= lineHeight;
      }
      // --- New Stamping Logic End ---
      console.log("Upload Step 6: Stamped metadata onto canvas.");

      // Step 3: Get stamped image as a Blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        console.log("Upload Step 7: Converting canvas to blob.");
        canvas.toBlob((b) => {
            if (b) {
              console.log("Upload Step 7.1: Canvas converted to blob successfully.");
              resolve(b);
            } else {
              console.error("Upload Step 7.2: Canvas toBlob failed, returned null.");
              reject(new Error('Could not convert canvas to image blob.'));
            }
        }, 'image/jpeg', 0.9);
      });
      
      const filename = `${reportType}-${Date.now()}.jpg`;
      const stampedFile = new File([blob], filename, { type: 'image/jpeg' });
      
      // Step 4: Upload stamped file
      console.log("Upload Step 8: Starting upload to Firebase Storage.");
      toast({ title: 'Uploading...', description: 'Your report is being submitted.' });
      const downloadURL = await uploadAttachment(taskId, stampedFile, (progress) => setUploadProgress(progress));
      
      // Step 5: Save metadata to Firestore
      console.log("Upload Step 9: Upload complete. Saving metadata to Firestore.");
      await addAttachmentMetadata({
        projectId,
        taskId,
        ownerUid: user.uid,
        ownerName: user.displayName || user.email || 'N/A',
        url: downloadURL,
        filename,
        reportType,
        location: location,
      });

      // --- SUCCESS ---
      console.log("Upload Step 10: Process complete.");
      toast({ title: 'Success!', description: 'Report submitted successfully.' });
      onSuccess(); // Close dialog on success

    } catch (error: any) {
      // --- FAILURE ---
      console.error('Upload failed at some point. Full Error:', error);
      let description = error.message || 'An unexpected error occurred during the submission process.';
      if (error.code === 'storage/unauthorized' || (error.message && error.message.toLowerCase().includes('cors'))) {
          description = "Permission denied by storage. Please ensure the storage CORS configuration has been applied correctly for this Firebase project using the `gsutil` command.";
      }
      toast({
        title: 'Upload Failed',
        description: description,
        variant: 'destructive',
      });
    } finally {
      // --- GUARANTEED CLEANUP ---
      console.log("Upload Step FINAL: Resetting UI state in finally block.");
      setIsUploading(false);
      setUploadProgress(null);
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline text-xl capitalize">{reportType.replace('-', ' ')} Submission</DialogTitle>
          <DialogDescription>
            {t('progressReportDialog.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
           {isFetchingLocation && (
              <Alert>
                <MapPin className="h-4 w-4 animate-pulse" />
                <AlertTitle>{t('location.fetchingTitle')}</AlertTitle>
                <AlertDescription>{t('location.fetchingDesc')}</AlertDescription>
              </Alert>
           )}
           {!isFetchingLocation && locationError && (
            <Alert variant="destructive">
              <MapPin className="h-4 w-4" />
              <AlertTitle>{t('location.requiredTitle')}</AlertTitle>
              <AlertDescription>
                {t('location.requiredDesc')}
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
                  fill
                  className="object-contain"
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
          <Button onClick={handleUpload} disabled={!selectedFile || isUploading || isFetchingLocation || !location}>
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
    

    