
"use client";

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { uploadAttachment, addAttachmentMetadata } from '@/services/attachmentService';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Loader2, Camera, CameraOff, UploadCloud, MapPin, X } from 'lucide-react';
import type { User } from '@/types';

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
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      const getPermissions = async () => {
        // Camera Permission
        try {
          let cameraStream;
          try {
            // Prefer rear camera
            cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          } catch (e) {
            console.warn("Could not get rear camera, trying default.", e);
            // Fallback to any camera
            cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
          }

          setStream(cameraStream);
          if (videoRef.current) {
            videoRef.current.srcObject = cameraStream;
          }
          setHasPermission(true);
        } catch (error) {
          console.error('Error accessing camera:', error);
          setHasPermission(false);
        }

        // Geolocation Permission
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
      };
      getPermissions();
    } else {
      // Cleanup when dialog closes
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleCaptureAndUpload = async () => {
    if (!videoRef.current || !canvasRef.current || !user) {
      toast({ title: "Error", description: "Component not ready or user not logged in.", variant: "destructive" });
      return;
    }
    setIsLoading(true);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) {
      toast({ title: "Error", description: "Could not get canvas context.", variant: "destructive" });
      setIsLoading(false);
      return;
    }

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      toast({
        title: "Camera Not Ready",
        description: "The camera is still initializing. Please wait a moment and try again.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    // Set canvas dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw video frame on canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Prepare and draw the stamp
    const now = new Date();
    const timeStamp = now.toLocaleString();
    const locationStamp = location ? `Lat: ${location.latitude.toFixed(4)}, Lon: ${location.longitude.toFixed(4)}` : 'Location N/A';
    const userStamp = user.displayName || user.email || 'Unknown User';
    const fullStamp = `${userStamp} | ${timeStamp} | ${locationStamp}`;
    
    const fontSize = Math.max(12, Math.round(canvas.width / 50));
    context.font = `bold ${fontSize}px Arial`;
    context.textAlign = 'right';
    context.textBaseline = 'bottom';
    
    const textMetrics = context.measureText(fullStamp);
    const padding = 10;
    
    context.fillStyle = 'rgba(0, 0, 0, 0.5)';
    context.fillRect(canvas.width - textMetrics.width - (padding * 2), canvas.height - fontSize - (padding * 2), textMetrics.width + (padding * 2), fontSize + (padding * 2));
    
    context.fillStyle = 'white';
    context.fillText(fullStamp, canvas.width - padding, canvas.height - padding);

    // Get file from canvas and upload
    canvas.toBlob(async (blob) => {
      if (blob) {
        const filename = `${reportType}-${Date.now()}.png`;
        const file = new File([blob], filename, { type: 'image/png' });
        
        try {
          const downloadURL = await uploadAttachment(taskId, file);
          await addAttachmentMetadata({
            projectId,
            taskId,
            ownerUid: user.uid,
            ownerName: user.displayName || user.email || 'N/A',
            url: downloadURL,
            filename,
            reportType,
            location: location || undefined
          });

          toast({ title: "Success", description: "Report submitted successfully." });
          onSuccess();
        } catch (error: any) {
          toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
        } finally {
          setIsLoading(false);
        }
      }
    }, 'image/png');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-headline text-xl capitalize">{reportType.replace('-', ' ')} Submission</DialogTitle>
          <DialogDescription>
            Capture a photo as proof. Your name, current time, and location will be stamped on the image.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {hasPermission === false && (
            <Alert variant="destructive">
              <CameraOff className="h-4 w-4" />
              <AlertTitle>Camera Access Denied</AlertTitle>
              <AlertDescription>
                Please enable camera permissions in your browser settings to use this feature.
              </AlertDescription>
            </Alert>
          )}
          {locationError && (
            <Alert variant="destructive">
              <MapPin className="h-4 w-4" />
              <AlertTitle>Location Access Denied</AlertTitle>
              <AlertDescription>
                {locationError} Stamping will proceed without location data.
              </AlertDescription>
            </Alert>
          )}

          {hasPermission && (
            <div className="relative w-full aspect-video bg-muted rounded-md overflow-hidden">
              <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
              <canvas ref={canvasRef} className="hidden" />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
                <X className="mr-2 h-4 w-4" /> Cancel
            </Button>
            <Button onClick={handleCaptureAndUpload} disabled={!hasPermission || isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                Capture &amp; Submit
            </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
