
"use client";

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { uploadAttendancePhoto, addAttendanceRecord } from '@/services/attendanceService';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Loader2, Camera, Upload, MapPin, X, ImagePlus } from 'lucide-react';
import Image from 'next/image';
import { Progress } from '@/components/ui/progress';

interface AttendanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  projectId: string;
  projectName: string;
}

interface Location {
  latitude: number;
  longitude: number;
  address?: string;
}

export function AttendanceDialog({ open, onOpenChange, onSuccess, projectId, projectName }: AttendanceDialogProps) {
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

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            let fetchedAddress = 'Address lookup failed.';
            try {
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

      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(new Error('Failed to load selected image. It might be corrupt.'));
        img.src = previewUrl;
      });

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) {
          throw new Error('Could not prepare image for upload. Canvas context is unavailable.');
      }
      
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      context.drawImage(image, 0, 0);

      // --- Stamping Logic ---
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

      const textLines = [ userStamp, timeStamp, coords, addressLine1 ];
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

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
            if (b) resolve(b);
            else reject(new Error('Could not convert canvas to image blob.'));
        }, 'image/jpeg', 0.9);
      });
      
      const filename = `attendance-${user.uid}-${Date.now()}.jpg`;
      const stampedFile = new File([blob], filename, { type: 'image/jpeg' });
      
      toast({ title: 'Uploading...', description: 'Your attendance is being submitted.' });
      const downloadURL = await uploadAttendancePhoto(stampedFile, (progress) => setUploadProgress(progress));
      
      await addAttendanceRecord({
        userId: user.uid,
        userName: user.displayName || user.email || 'N/A',
        projectId: projectId,
        projectName: projectName,
        photoUrl: downloadURL,
        location: location || undefined,
      });

      toast({ title: 'Success!', description: 'Attendance submitted successfully.' });
      onSuccess();

    } catch (error: any) {
      let description = error.message || 'An unexpected error occurred during the submission process.';
      if (error.code === 'storage/unauthorized' || (error.message && error.message.toLowerCase().includes('cors'))) {
          description = "Permission denied by storage. Please ensure the storage CORS configuration has been applied correctly.";
      }
      toast({ title: 'Upload Failed', description: description, variant: 'destructive' });
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline text-xl capitalize">Submit Daily Attendance</DialogTitle>
          <DialogDescription>
            Submit attendance for project: <span className="font-semibold text-primary">{projectName}</span>.
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
              disabled={isUploading}
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <Camera className="mr-2 h-4 w-4" />
              {selectedFile ? 'Change Photo' : 'Take Photo'}
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
