
"use client";

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { uploadAttachment, addAttachmentMetadata } from '@/services/attachmentService';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Loader2, Camera, CameraOff, MapPin, X } from 'lucide-react';
import type { User } from '@/types';
import { cn } from '@/lib/utils';

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
  const [isUploading, setIsUploading] = useState(false);
  const [isCameraInitializing, setIsCameraInitializing] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);

  useEffect(() => {
    if (!open) {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      return;
    }

    let localStream: MediaStream | null = null;

    const getPermissionsAndStream = async () => {
      setHasPermission(null);
      setLocation(null);
      setLocationError(null);
      setIsCameraInitializing(true);
      setIsCameraReady(false);

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
      
      try {
        let cameraStream;
        try {
          cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        } catch (e) {
          console.warn("Could not get rear camera, trying default.", e);
          cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
        }
        
        localStream = cameraStream;
        if (videoRef.current) {
          videoRef.current.srcObject = localStream;
          videoRef.current.onloadedmetadata = () => {
            setIsCameraInitializing(false);
            setIsCameraReady(true);
          };
        }
        setHasPermission(true);
      } catch (error) {
        console.error('Error accessing camera:', error);
        setHasPermission(false);
        setIsCameraInitializing(false);
      }
    };
    
    getPermissionsAndStream();

    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.onloadedmetadata = null;
      }
      setIsCameraInitializing(false);
      setIsCameraReady(false);
    };
  }, [open]);

  const handleCaptureAndUpload = async () => {
    if (!videoRef.current || !canvasRef.current || !user || !isCameraReady) {
        toast({ title: "Error", description: "Component not ready, user not logged in, or camera not available.", variant: "destructive" });
        return;
    }

    setIsUploading(true);

    try {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (!context) {
            throw new Error("Could not get canvas context.");
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

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

        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
        
        if (!blob) {
            throw new Error("Could not create image from camera feed.");
        }
        
        const filename = `${reportType}-${Date.now()}.png`;
        const file = new File([blob], filename, { type: 'image/png' });
        
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
        console.error("Capture and Upload Error:", error);
        let description = "An unexpected error occurred during capture.";
        if (error.message) {
            description = error.message;
        }
        if (error.code === 'storage/unknown' || error.code === 'storage/unauthorized') {
            description = "Upload failed due to a permission error. Please ensure Firebase Storage rules allow writes for authenticated users.";
        }
        toast({ title: "Action Failed", description, variant: "destructive" });
    } finally {
        setIsUploading(false);
    }
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

          <div className="relative w-full aspect-video bg-muted rounded-md overflow-hidden flex items-center justify-center">
             {isCameraInitializing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 z-10">
                    <Loader2 className="h-8 w-8 animate-spin text-white" />
                    <p className="text-white mt-2">Starting camera...</p>
                </div>
            )}
            <video ref={videoRef} className={cn("w-full h-full object-cover", { 'invisible': isCameraInitializing })} autoPlay muted playsInline />
            <canvas ref={canvasRef} className="hidden" />
          </div>

        </div>
        <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUploading}>
                <X className="mr-2 h-4 w-4" /> Cancel
            </Button>
            <Button onClick={handleCaptureAndUpload} disabled={!isCameraReady || isUploading}>
                {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                Capture &amp; Submit
            </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
