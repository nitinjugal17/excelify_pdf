
"use client";

import { useRef, useState } from 'react';
import type { FC, DragEvent } from 'react';
import { UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';


interface FileUploaderProps {
  onFilesAdded: (files: File[]) => void;
}

export const FileUploader: FC<FileUploaderProps> = ({ onFilesAdded }) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };
  
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const acceptedFiles = Array.from(e.dataTransfer.files).filter(
        file => file.type === 'application/pdf'
      );
      if (acceptedFiles.length > 0) {
        onFilesAdded(acceptedFiles);
      } else {
        toast({
            variant: "destructive",
            title: "Invalid file type",
            description: "Please upload PDF files only.",
        });
      }
      e.dataTransfer.clearData();
    }
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      const acceptedFiles = Array.from(e.target.files).filter(
        file => file.type === 'application/pdf'
      );
       if (acceptedFiles.length > 0) {
        onFilesAdded(acceptedFiles);
      }
      // Reset file input to allow re-uploading the same file
      e.target.value = '';
    }
  };
  
  const onButtonClick = () => {
    inputRef.current?.click();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 2: Upload Your PDFs</CardTitle>
        <CardDescription>Drag and drop your files below or click to browse. This will generate page previews before processing begins.</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={cn(
            'border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors duration-200 ease-in-out bg-background',
            isDragActive ? 'border-primary bg-primary/10' : 'border-input hover:border-primary'
          )}
          onClick={onButtonClick}
        >
          <input 
            ref={inputRef}
            type="file" 
            className="hidden" 
            multiple 
            onChange={handleChange}
            accept="application/pdf"
          />
          <div className="flex flex-col items-center gap-4 text-muted-foreground pointer-events-none">
            <UploadCloud className="w-16 h-16 text-primary" />
            <p className="text-xl font-semibold">
              {isDragActive ? 'Drop the files here...' : 'Drag & drop your PDF files here'}
            </p>
            <p className="text-sm">You can upload multiple files at once.</p>
            <Button 
              type="button" 
              variant="default" 
              className="mt-4 pointer-events-auto" 
              onClick={(e) => { 
                e.stopPropagation(); 
                onButtonClick(); 
              }}
            >
              Browse Files
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

    