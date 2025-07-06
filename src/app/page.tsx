
"use client";

import { useState } from 'react';
import { FileUploader } from '@/components/file-uploader';
import { FileList } from '@/components/file-list';
import { useToast } from "@/hooks/use-toast";
import { FileSpreadsheet } from 'lucide-react';
import Tesseract from 'tesseract.js';
import * as pdfjs from 'pdfjs-dist';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { suggestCleaningRules } from '@/ai/flows/suggest-cleaning-rules';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { extractTableWithTextract } from '@/ai/flows/textract-ocr';
import { cleanOcrData } from '@/ai/flows/clean-ocr-data';
import { ocrWithGoogleVision } from '@/ai/flows/google-vision-ocr';
import { ocrWithOcrSpace } from '@/ai/flows/ocr-space';

// Set up the worker source for pdfjs-dist
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export type OcrEngine = 'tesseract' | 'textract' | 'google' | 'ocrspace';

export interface ExtractionTask {
  id: string;
  name: string;
  columnHeaders: string;
  columnSeparators: string;
  eliminators: string;
  findValues: string;
  replaceValues: string;
  structuredDataPreview?: Record<string, string>[];
}

export interface ProcessedFile {
  id:string;
  file: File;
  status: 'pending' | 'awaiting-selection' | 'processing' | 'completed' | 'error';
  progress: number;
  ocrEngine?: OcrEngine;
  languages?: string[];
  error?: string;
  // Tesseract & Google Vision fields
  extractedData?: { page: number, tsv: string }[];
  pageImages?: (string | undefined)[];
  analysis?: string;
  manuallyEditedPages?: Map<number, string>;
  // Page selection properties
  totalPages?: number;
  pagePreviews?: { page: number; imageUri: string }[];
  selectedPages: Set<number>;
  // Textract-specific output field
  structuredDataPreview?: Record<string, string>[];
  // Tesseract region selection
  selectionRectangles?: { left: number; top: number; width: number; height: number; }[];
  pageImageDimensions?: ({ width: number; height: number; } | undefined)[];
  extractionTasks: ExtractionTask[];
}

// Helper function to escape special characters for use in a regular expression.
function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ENG_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const HINDI_CHARS = 'ँंःअआइईउऊऋएऐओऔकखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह़ािीुूृेैोौ्०१२३४५६७८९';
const SYMBOLS = '.,-/:()# ';

export default function Home() {
  const [files, setFiles] = useState<ProcessedFile[]>([]);
  const [languages, setLanguages] = useState<string[]>(['eng']);
  const [ocrEngine, setOcrEngine] = useState<OcrEngine>('tesseract');
  const [ocrSpaceApiKey, setOcrSpaceApiKey] = useState<string>('');
  const [charWhitelist, setCharWhitelist] = useState<string>(ENG_CHARS + SYMBOLS);
  const [opencvApiUrl, setOpencvApiUrl] = useState<string>('');
  const [applyBinarization, setApplyBinarization] = useState<boolean>(false);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [reSuggestingTaskId, setReSuggestingTaskId] = useState<string | null>(null);
  const [reprocessingFileId, setReprocessingFileId] = useState<string | null>(null);
  const [reOcrFileId, setReOcrFileId] = useState<string | null>(null);
  const [previewingFileId, setPreviewingFileId] = useState<string | null>(null);
  const { toast } = useToast();

  const handleLanguageChange = (lang: string, checked: boolean) => {
    setLanguages(prev => {
        const currentLangs = new Set(prev);
        
        if (lang === 'hinglish') {
            if (checked) {
                currentLangs.add('eng');
                currentLangs.add('hin');
            } else {
                currentLangs.delete('eng');
                currentLangs.delete('hin');
            }
        } else {
            if (checked) {
                currentLangs.add(lang);
            } else {
                currentLangs.delete(lang);
            }
        }

        const newLangs = Array.from(currentLangs);

        if (newLangs.length === 0) {
            toast({
                variant: "destructive",
                title: "Language Required",
                description: "At least one language must be selected for OCR.",
            });
            return prev;
        }

        // Update whitelist based on new languages
        let newWhitelist = '';
        if (newLangs.includes('eng')) {
            newWhitelist += ENG_CHARS;
        }
        if (newLangs.includes('hin')) {
            newWhitelist += HINDI_CHARS;
        }
        newWhitelist += SYMBOLS;
        setCharWhitelist(newWhitelist);
        
        return newLangs;
    });
  };
  
  const handleTextChange = (fileId: string, page: number, newText: string) => {
    setFiles(prev =>
      prev.map(f => {
        if (f.id === fileId) {
          const newEditedPages = new Map(f.manuallyEditedPages || []);
          newEditedPages.set(page, newText);
          const updatedTasks = f.extractionTasks.map(task => ({ ...task, structuredDataPreview: undefined }));
          return { ...f, manuallyEditedPages: newEditedPages, extractionTasks: updatedTasks };
        }
        return f;
      })
    );
  };

  const handleAddTask = (fileId: string) => {
    setFiles(prev => prev.map(f => {
      if (f.id === fileId) {
        const newTask: ExtractionTask = {
          id: `task-${Date.now()}`,
          name: `Sheet ${f.extractionTasks.length + 1}`,
          columnHeaders: '',
          columnSeparators: '\t',
          eliminators: '',
          findValues: '',
          replaceValues: '',
        };
        return { ...f, extractionTasks: [...f.extractionTasks, newTask] };
      }
      return f;
    }));
  };

  const handleRemoveTask = (fileId: string, taskId: string) => {
    setFiles(prev => prev.map(f => {
      if (f.id === fileId) {
        const newTasks = f.extractionTasks.filter(task => task.id !== taskId);
        return { ...f, extractionTasks: newTasks };
      }
      return f;
    }));
  };

  const handleUpdateTask = (fileId: string, taskId: string, delta: Partial<ExtractionTask>) => {
    setFiles(prev => prev.map(f => {
      if (f.id === fileId) {
        const newTasks = f.extractionTasks.map(task => {
          if (task.id === taskId) {
            return { ...task, ...delta, structuredDataPreview: undefined };
          }
          return task;
        });
        return { ...f, extractionTasks: newTasks };
      }
      return f;
    }));
  };
  
  const handleSetSelectionRectangles = (fileId: string, rects: { left: number; top: number; width: number; height: number; }[] | null) => {
    setFiles(prev => prev.map(f => {
        if (f.id === fileId) {
            // Also clear existing previews as they are now out of date
            const updatedTasks = f.extractionTasks.map(task => ({ ...task, structuredDataPreview: undefined }));
            return { ...f, selectionRectangles: rects || undefined, extractionTasks: updatedTasks };
        }
        return f;
    }));
  };

  const processTask = async (file: ProcessedFile, task: ExtractionTask): Promise<Record<string, string>[]> => {
      if (!file.extractedData || !task.columnHeaders.trim()) {
          return [];
      }

      const findValues = task.findValues ? task.findValues.split(',').map(v => v.trim()) : [];
      const replaceValues = task.replaceValues ? task.replaceValues.split(',').map(v => v.trim()) : [];
      const eliminators = task.eliminators ? task.eliminators.split(',').map(e => e.trim().toLowerCase()).filter(Boolean) : [];
      const useCorrections = findValues.length > 0 && findValues.length === replaceValues.length;
      
      const allStructuredData: Record<string, string>[] = [];
      const sortedPages = file.extractedData.sort((a, b) => a.page - b.page);

      for (const pageData of sortedPages) {
          let pageText: string = file.manuallyEditedPages?.get(pageData.page) ?? pageData.tsv;

          if (useCorrections) {
              for (let i = 0; i < findValues.length; i++) {
                  if (findValues[i]) {
                      const findRegex = new RegExp(escapeRegExp(findValues[i]), 'g');
                      pageText = pageText.replace(findRegex, replaceValues[i]);
                  }
              }
          }
          
          if (eliminators.length > 0) {
              const lines = pageText.split('\n');
              pageText = lines.filter(line => !eliminators.some(e => line.toLowerCase().includes(e))).join('\n');
          }

          if (!pageText.trim()) {
              continue;
          }

          const separator = task.columnSeparators || '\t';
          const { structuredData: structuredDataForPage } = await cleanOcrData({
              rawText: pageText,
              headersString: task.columnHeaders,
              separator: separator,
          });

          allStructuredData.push(...structuredDataForPage);
      }
      
      return allStructuredData;
  };

  const handlePreviewData = async (fileId: string, taskId: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file) return;

    const task = file.extractionTasks.find(t => t.id === taskId);
    if (!task) return;

    if (!task.columnHeaders.trim()) {
        toast({
            variant: 'destructive',
            title: 'Data Keys Required',
            description: 'Please provide the data keys (headers) for this task before generating a preview.',
        });
        return;
    }

    setPreviewingFileId(`${fileId}-${taskId}`);
    try {
        toast({
            title: `Generating Preview for ${task.name}`,
            description: 'Structuring data based on your rules...',
        });
        
        const structuredData = await processTask(file, task);

        setFiles(prev => prev.map(f => {
            if (f.id === fileId) {
                const newTasks = f.extractionTasks.map(t => t.id === taskId ? { ...t, structuredDataPreview: structuredData } : t);
                return { ...f, extractionTasks: newTasks };
            }
            return f;
        }));

        toast({
            title: 'Preview Ready',
            description: `Review the structured data for ${task.name} below.`,
        });

    } catch (error) {
        console.error("Failed to generate preview:", error);
        toast({
            variant: "destructive",
            title: "Preview Failed",
            description: "An error occurred while generating the preview. Please check your rules and data.",
        });
    } finally {
        setPreviewingFileId(null);
    }
  };

  const generateAndDownloadExcel = async (file: ProcessedFile) => {
    setDownloadingFileId(file.id);
    const workbook = XLSX.utils.book_new();

    try {
        if (file.ocrEngine === 'textract') {
             if (file.structuredDataPreview && file.structuredDataPreview.length > 0) {
                const worksheet = XLSX.utils.json_to_sheet(file.structuredDataPreview);
                XLSX.utils.book_append_sheet(workbook, worksheet, 'Extracted Data');
             } else {
                const worksheet = XLSX.utils.aoa_to_sheet([["No structured data was found."]]);
                XLSX.utils.book_append_sheet(workbook, worksheet, 'No Data Found');
             }
        } else if (file.ocrEngine === 'tesseract' || file.ocrEngine === 'google' || file.ocrEngine === 'ocrspace') {
            if (file.extractionTasks.length === 0) {
                toast({ variant: 'destructive', title: 'No Tasks Defined', description: 'Please add at least one extraction task.' });
                setDownloadingFileId(null);
                return;
            }

            toast({ title: 'Structuring in Progress', description: 'Generating sheets for your Excel file...' });
            
            for (const task of file.extractionTasks) {
                let finalData = task.structuredDataPreview;
                let finalHeaders: string[] = [];
                
                if (!finalData) {
                    finalData = await processTask(file, task);
                }

                if (finalData && finalData.length > 0) {
                    finalHeaders = Object.keys(finalData[0]);
                    const worksheet = XLSX.utils.json_to_sheet(finalData, { header: finalHeaders });
                    XLSX.utils.book_append_sheet(workbook, worksheet, task.name);
                } else if (task.columnHeaders.trim()) {
                     const worksheet = XLSX.utils.aoa_to_sheet([["No structured data was generated for this task."]]);
                     XLSX.utils.book_append_sheet(workbook, worksheet, task.name);
                } else {
                    toast({ variant: 'destructive', title: `Data Keys Missing in Task "${task.name}"`, description: 'Skipping sheet. Please provide headers.' });
                }
            }

            if (workbook.SheetNames.length === 0) {
              toast({ variant: 'destructive', title: 'Export Failed', description: 'No valid data could be generated from your tasks.' });
              setDownloadingFileId(null);
              return;
            }
        }
      
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
        const excelBase64 = Buffer.from(excelBuffer).toString('base64');
        const excelDataUri = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${excelBase64}`;

        const link = document.createElement('a');
        link.href = excelDataUri;
        link.download = file.file.name.replace(/\.pdf$/i, '.xlsx');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast({ title: 'Download Started', description: `Your Excel file for ${file.file.name} is downloading.` });
    } catch (error) {
        console.error("Failed to generate or download Excel file:", error);
        toast({ variant: "destructive", title: "Download Failed", description: "An error occurred while preparing your file. Please check your rules and data." });
    } finally {
        setDownloadingFileId(null);
    }
  };


  const handleFileToDataUri = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const processFile = async (processedFile: ProcessedFile, selectedLangs: string[], engine: OcrEngine) => {
    const isReOcr = !!processedFile.pageImages?.length;

    // Set status to 'processing', ensuring we use the passed-in file state to avoid staleness.
    setFiles(prev => prev.map(f => {
        if (f.id !== processedFile.id) return f;
        
        return {
          ...f,
          status: 'processing', 
          progress: 5, 
          ocrEngine: engine, 
          languages: selectedLangs,
          extractedData: [], // Always clear old OCR data before a run
          analysis: isReOcr ? f.analysis : 'Processing...',
          manuallyEditedPages: isReOcr ? f.manuallyEditedPages : new Map(),
           // Clear any existing previews, as they are now invalid
          extractionTasks: f.extractionTasks.map(task => ({ ...task, structuredDataPreview: undefined })),
        };
    }));
    
    try {
        toast({
            title: `Processing Started (${engine === 'tesseract' ? 'Tesseract.js' : engine === 'textract' ? 'Amazon Textract' : engine === 'google' ? 'Google Cloud Vision' : 'OCR.space'})`,
            description: `Extracting data from ${processedFile.file.name}... This may take a while.`,
        });

        const dataUri = await handleFileToDataUri(processedFile.file);
        const pdf = await pdfjs.getDocument(dataUri).promise;
        const pagesToProcess = Array.from(processedFile.selectedPages).sort((a,b) => a - b);
        const numPages = pagesToProcess.length;
        
        let tesseractWorker: Tesseract.Worker | null = null;
        if (engine === 'tesseract') {
            const langString = selectedLangs.join('+');
            tesseractWorker = await Tesseract.createWorker(langString); 
            await tesseractWorker.setParameters({
                'preserve_interword_spaces': '1',
                tessedit_char_whitelist: charWhitelist,
                load_system_dawg: '0',
                load_freq_dawg: '0',
            });
        }
        
        let processedCount = 0;
        let allStructuredData: Record<string, string>[] = [];
        const newExtractedDataForFile: { page: number; tsv: string }[] = [];
        const newPageImagesForFile: (string | undefined)[] = [...(processedFile.pageImages || [])];
        const newPageImageDimensionsForFile: ({ width: number; height: number; } | undefined)[] = [...(processedFile.pageImageDimensions || [])];


        for (const pageNumber of pagesToProcess) {
            const page = await pdf.getPage(pageNumber);
            const processingViewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = processingViewport.height;
            canvas.width = processingViewport.width;

            if (context) {
                await page.render({ canvasContext: context, viewport: processingViewport }).promise;

                if (engine === 'tesseract' && applyBinarization) {
                    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imageData.data;
                    const threshold = 128; // A common threshold value
                    for (let i = 0; i < data.length; i += 4) {
                        const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                        const color = luminance > threshold ? 255 : 0;
                        data[i] = color;
                        data[i + 1] = color;
                        data[i + 2] = color;
                    }
                    context.putImageData(imageData, 0, 0);
                }
                
                const imageDataUri = canvas.toDataURL('image/png');
                
                let imageToRecognize = imageDataUri; // Default to original image

                if (engine === 'tesseract' && opencvApiUrl.trim()) {
                    try {
                        toast({
                            title: `Pre-processing Page ${pageNumber}`,
                            description: `Sending image to custom OpenCV API...`
                        });
                        const response = await fetch(opencvApiUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ imageDataUri: imageDataUri })
                        });

                        if (!response.ok) {
                            throw new Error(`API request failed with status ${response.status}`);
                        }

                        const result = await response.json();

                        if (result.processedImageDataUri) {
                            imageToRecognize = result.processedImageDataUri;
                            toast({
                                variant: "default",
                                title: `Pre-processing Succeeded (Page ${pageNumber})`,
                                description: "Using pre-processed image from your API for OCR.",
                            });
                        } else {
                           throw new Error("API response did not contain 'processedImageDataUri'.");
                        }

                    } catch (error) {
                        console.warn(`OpenCV API call failed for page ${pageNumber}. Falling back to original image.`, error);
                        toast({
                            variant: "destructive",
                            title: "OpenCV Pre-processing Failed",
                            description: `Could not use the API for page ${pageNumber}. Using original image instead.`,
                        });
                    }
                }

                if (engine === 'textract') {
                    const pageStructuredData = await extractTableWithTextract({ imageDataUri: imageToRecognize });
                    allStructuredData = allStructuredData.concat(pageStructuredData);
                } else if (engine === 'google') {
                    const { text } = await ocrWithGoogleVision({ imageDataUri: imageToRecognize });
                    const pageText = text.trim();
                    newExtractedDataForFile.push({ page: pageNumber, tsv: pageText });
                    newPageImagesForFile[pageNumber - 1] = imageDataUri;
                    newPageImageDimensionsForFile[pageNumber - 1] = { width: canvas.width, height: canvas.height };

                } else if (engine === 'ocrspace') {
                    toast({
                        title: `Sending Page ${pageNumber} to OCR.space`,
                        description: `Processing page ${pageNumber} of ${processedFile.file.name}...`
                    });
                    const langString = selectedLangs.join(',');
                    const { text } = await ocrWithOcrSpace({
                        imageDataUri: imageToRecognize,
                        apiKey: ocrSpaceApiKey,
                        language: langString
                    });
                    const pageText = text.trim();
                    newExtractedDataForFile.push({ page: pageNumber, tsv: pageText });
                    newPageImagesForFile[pageNumber - 1] = imageDataUri;
                    newPageImageDimensionsForFile[pageNumber - 1] = { width: canvas.width, height: canvas.height };
                
                } else if (tesseractWorker) {
                    const options: any = {};
                    if (processedFile.selectionRectangles && processedFile.selectionRectangles.length > 0) {
                        options.rectangles = processedFile.selectionRectangles;
                    }
                    const { data } = await tesseractWorker.recognize(imageToRecognize, options);
                    // Use the lines data to reconstruct text without metadata, preserving line breaks.
                    const pageText = data.lines.map(line => line.text).join('\n');
                    newExtractedDataForFile.push({ page: pageNumber, tsv: pageText });
                    newPageImagesForFile[pageNumber - 1] = imageDataUri;
                    newPageImageDimensionsForFile[pageNumber - 1] = { width: canvas.width, height: canvas.height };
                }
                
                processedCount++;
                const progress = Math.min(100, Math.round(5 + (processedCount / numPages) * 95));
                setFiles(prev => prev.map(f => f.id === processedFile.id ? { ...f, progress } : f));
            }
        }

        if (tesseractWorker) {
            await tesseractWorker.terminate();
        }
        
        toast({
            title: "Processing Complete",
            description: `${processedFile.file.name} is ready for the next step.`,
        });

        // Final, definitive state update using the most recent state from the array.
        setFiles(prev => prev.map(f => {
            if (f.id !== processedFile.id) return f;
            
            if (engine === 'textract') {
                return {
                    ...f, // Use current state 'f' as the base
                    status: 'completed',
                    progress: 100,
                    structuredDataPreview: allStructuredData,
                    analysis: `Extracted ${allStructuredData.length} rows using Amazon Textract's table analysis.`
                };
            }
            
            const sortedNewData = newExtractedDataForFile.sort((a, b) => a.page - b.page);
            
            const defaultTask: ExtractionTask = {
              id: `task-${Date.now()}`,
              name: 'Sheet 1',
              columnHeaders: '',
              columnSeparators: '\t',
              eliminators: '',
              findValues: '',
              replaceValues: '',
            };

            const wasReOcrWithTasks = f.extractionTasks.length > 0;
            
            const updatedFileWithData: ProcessedFile = {
                ...f, // Use current state 'f' as the base
                status: 'completed',
                progress: 100,
                extractedData: sortedNewData,
                pageImages: newPageImagesForFile,
                pageImageDimensions: newPageImageDimensionsForFile,
                extractionTasks: wasReOcrWithTasks ? f.extractionTasks.map(task => ({...task, structuredDataPreview: undefined})) : [defaultTask],
                analysis: 'Processing complete. Review extracted text and define extraction rules.',
            };
            
            return updatedFileWithData;
        }));

    } catch (error) {
        console.error(error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        setFiles(prev => prev.map(f => f.id === processedFile.id ? { ...processedFile, status: 'error', progress: 0, error: errorMessage } : f));
        toast({
            variant: "destructive",
            title: "Conversion failed",
            description: errorMessage,
        });
    }
  };

  const generatePagePreviews = async (fileToPreview: ProcessedFile) => {
    try {
        const dataUri = await handleFileToDataUri(fileToPreview.file);
        const pdf = await pdfjs.getDocument(dataUri).promise;
        const numPages = pdf.numPages;
        const previews: { page: number; imageUri: string }[] = [];
        const dimensions: ({ width: number; height: number; } | undefined)[] = [];

        for (let i = 1; i <= numPages; i++) {
            const page = await pdf.getPage(i);

            const processingViewport = page.getViewport({ scale: 2.0 });
            dimensions.push({ width: processingViewport.width, height: processingViewport.height });

            const viewport = page.getViewport({ scale: 0.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            if (context) {
                await page.render({ canvasContext: context, viewport: viewport }).promise;
                previews.push({ page: i, imageUri: canvas.toDataURL('image/jpeg', 0.8) });
            }

            setFiles(prev => prev.map(f =>
                f.id === fileToPreview.id ? { ...f, progress: Math.round((i / numPages) * 100) } : f
            ));
        }

        setFiles(prev => prev.map(f =>
            f.id === fileToPreview.id ? {
                ...f,
                status: 'awaiting-selection',
                totalPages: numPages,
                pagePreviews: previews,
                pageImageDimensions: dimensions,
                progress: 0
            } : f
        ));
    } catch (error) {
        console.error("Failed to generate previews:", error);
        const errorMessage = error instanceof Error ? error.message : "Could not read PDF for preview.";
        setFiles(prev => prev.map(f => f.id === fileToPreview.id ? { ...f, status: 'error', progress: 0, error: errorMessage } : f));
        toast({
            variant: "destructive",
            title: "Preview Failed",
            description: `Could not generate previews for ${fileToPreview.file.name}.`,
        });
    }
  };
  
  const handlePageSelectionChange = (fileId: string, page: number, isSelected: boolean) => {
    setFiles(prev => prev.map(f => {
        if (f.id === fileId) {
            const newSelectedPages = new Set(f.selectedPages);
            if (isSelected) {
                newSelectedPages.add(page);
            } else {
                newSelectedPages.delete(page);
            }
            return { ...f, selectedPages: newSelectedPages };
        }
        return f;
    }));
  };

  const handleSelectAllPages = (fileId: string, select: boolean) => {
      setFiles(prev => prev.map(f => {
          if (f.id === fileId && f.totalPages) {
              const newSelectedPages = new Set<number>();
              if (select) {
                  for (let i = 1; i <= f.totalPages; i++) {
                      newSelectedPages.add(i);
                  }
              }
              return { ...f, selectedPages: newSelectedPages };
          }
          return f;
      }));
  };

  const handleStartProcessing = (fileId: string) => {
      const fileToProcess = files.find(f => f.id === fileId);
      if (fileToProcess) {
          if (fileToProcess.selectedPages.size === 0) {
              toast({
                  variant: "destructive",
                  title: "No Pages Selected",
                  description: "Please select at least one page to process.",
              });
              return;
          }
          processFile(fileToProcess, languages, ocrEngine);
      }
  };

  const handleReprocess = async (fileId: string) => {
    const fileToReprocess = files.find((f) => f.id === fileId);
    if (!fileToReprocess) return;
    
    setReprocessingFileId(fileId);

    try {
      const resetFile: ProcessedFile = {
        id: fileToReprocess.id,
        file: fileToReprocess.file,
        status: 'pending',
        progress: 0,
        selectedPages: new Set(),
        // This is the key change: preserve tasks, but clear their previews.
        extractionTasks: fileToReprocess.extractionTasks.map(task => ({
          ...task,
          structuredDataPreview: undefined
        })),
        // Reset all other processing artifacts
        pageImageDimensions: [],
        pageImages: [],
        selectionRectangles: undefined,
        manuallyEditedPages: new Map(),
        extractedData: undefined,
        analysis: undefined,
        error: undefined,
        ocrEngine: undefined,
        languages: undefined,
      };
      
      setFiles(prev => prev.map(f => f.id === fileId ? resetFile : f));

      await generatePagePreviews(resetFile);
    } catch (error) {
        console.error("Reprocessing failed:", error);
        toast({
            variant: "destructive",
            title: "Reprocessing Failed",
            description: "An unexpected error occurred while trying to reprocess the file."
        });
    } finally {
        setReprocessingFileId(null);
    }
  };

  const handleReOcr = async (fileId: string) => {
    const fileToReOcr = files.find(f => f.id === fileId);
    if (!fileToReOcr) return;

    setReOcrFileId(fileId);
    try {
        if (fileToReOcr.ocrEngine && fileToReOcr.languages) {
            toast({
                title: "Re-running OCR",
                description: "Applying new region selections and reprocessing pages...",
            });
            await processFile(fileToReOcr, fileToReOcr.languages, fileToReOcr.ocrEngine);
        } else {
            console.error("Could not re-OCR file", fileId, fileToReOcr);
            toast({
                variant: "destructive",
                title: "Re-OCR Failed",
                description: "Could not find the necessary information to re-run OCR.",
            });
        }
    } catch (error) {
        console.error("Re-OCR failed with error:", error);
        toast({
            variant: "destructive",
            title: "Re-OCR Failed",
            description: "An unexpected error occurred while re-running the OCR."
        });
    } finally {
        setReOcrFileId(null);
    }
  };

  const handleRunAiSuggestions = async (fileId: string, rawText: string, taskIdToUpdate: string) => {
    if (!rawText.trim()) {
        toast({
            variant: "destructive",
            title: "No Text Found",
            description: "Cannot run suggestions as there is no text on this page.",
        });
        return;
    }

    setReSuggestingTaskId(taskIdToUpdate);
    try {
        toast({
            title: "Running AI Analysis",
            description: "The AI is generating suggestions based on the selected page...",
        });

        const aiSuggestions = await suggestCleaningRules({ rawText });
        
        setFiles(prev => prev.map(f => {
            if (f.id === fileId) {
                const newTasks = f.extractionTasks.map(task => {
                    if (task.id === taskIdToUpdate) {
                        toast({
                            title: `AI Suggestions applied to "${task.name}"`,
                            description: "Review the updated rules for this task.",
                        });
                        return {
                            ...task,
                            columnHeaders: aiSuggestions.suggestedHeaders,
                            eliminators: aiSuggestions.suggestedEliminators,
                            findValues: aiSuggestions.suggestedFindValues,
                            replaceValues: aiSuggestions.suggestedReplaceValues,
                            structuredDataPreview: undefined,
                        };
                    }
                    return task;
                });
                
                return {
                    ...f,
                    extractionTasks: newTasks,
                    analysis: aiSuggestions.analysis
                };
            }
            return f;
        }));

    } catch (error) {
        console.error("Failed to run AI suggestions:", error);
        const updatedAnalysis = error instanceof Error ? `AI analysis failed: ${error.message}` : "An unexpected error occurred during AI analysis.";
        
        setFiles(prev => prev.map(f => {
            if (f.id === fileId) {
                return { ...f, analysis: updatedAnalysis };
            }
            return f;
        }));

        toast({
            variant: "destructive",
            title: "Suggestion Failed",
            description: "An error occurred while generating suggestions. Please try another page or define rules manually.",
        });
    } finally {
        setReSuggestingTaskId(null);
    }
  };

  const onFilesAdded = (addedFiles: File[]) => {
    if ((ocrEngine === 'tesseract' || ocrEngine === 'ocrspace') && languages.length === 0) {
        toast({
            variant: "destructive",
            title: "No Language Selected",
            description: "Please select at least one language before uploading files.",
        });
        return;
    }
    if (ocrEngine === 'ocrspace' && !ocrSpaceApiKey.trim()) {
      toast({
        variant: 'destructive',
        title: 'API Key Required',
        description: 'Please enter your OCR.space API key before uploading files.',
      });
      return;
    }
    
    const newFiles: ProcessedFile[] = addedFiles.map(file => ({
      id: `${file.name}-${file.lastModified}-${file.size}`,
      file,
      status: 'pending',
      progress: 0,
      selectedPages: new Set(),
      extractionTasks: [],
    }));

    const uniqueNewFiles = newFiles.filter(newFile => !files.some(existingFile => existingFile.id === newFile.id));

    setFiles(prev => [...prev, ...uniqueNewFiles]);
    uniqueNewFiles.forEach(generatePagePreviews);
  };
  
  const clearAll = () => {
    setFiles([]);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-grow container mx-auto max-w-7xl px-4 py-8 md:py-12">
        <header className="text-center mb-12">
           <div className="inline-block bg-primary/10 p-4 rounded-full mb-4">
              <FileSpreadsheet className="w-10 h-10 text-primary" />
           </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-primary">
            PDF to Excel OCR Pipeline
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-3xl mx-auto">
            Extract structured data from your PDFs using a powerful, multi-stage pipeline. Choose the best engine for your document's complexity.
          </p>
        </header>

        <div className="space-y-8">
            <Card>
                <CardHeader>
                    <CardTitle>Step 1: Choose Your Extraction Engine</CardTitle>
                    <CardDescription>Select an engine based on your document's complexity and your desired level of control.</CardDescription>
                </CardHeader>
                <CardContent>
                    <RadioGroup value={ocrEngine} onValueChange={(value) => setOcrEngine(value as OcrEngine)} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2 p-4 border rounded-lg bg-background has-[[data-state=checked]]:bg-primary/5 has-[[data-state=checked]]:border-primary">
                            <div className="flex items-center space-x-3">
                                <RadioGroupItem value="tesseract" id="r-tesseract" />
                                <Label htmlFor="r-tesseract" className="text-base font-semibold">Tesseract + AI Structuring</Label>
                            </div>
                            <div className="pl-7 text-sm space-y-2 text-muted-foreground">
                                <p><strong>Free, private, and runs in your browser.</strong> A "text extractor" that gives you full control over the extraction process via manual rules.</p>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li><strong>Strength:</strong> Highly configurable. Best when you need precise, manual control over data cleaning and structuring. For complex layouts, the integrated AI is required to correctly structure the raw text.</li>
                                    <li><strong>For Best Results:</strong> Use the "Review & Edit" panel to refine the raw text, and use the "Get AI Suggestions" feature to generate initial rules.</li>
                                </ul>
                            </div>
                        </div>
                        <div className="space-y-2 p-4 border rounded-lg bg-background has-[[data-state=checked]]:bg-primary/5 has-[[data-state=checked]]:border-primary">
                            <div className="flex items-center space-x-3">
                                <RadioGroupItem value="textract" id="r-textract" />
                                <Label htmlFor="r-textract" className="text-base font-semibold">Amazon Textract (High Accuracy)</Label>
                            </div>
                            <div className="pl-7 text-sm space-y-2 text-muted-foreground">
                                <p><strong>High-accuracy, automated "document structure preserver."</strong> Uses a powerful cloud service to automatically detect and extract tables.</p>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li><strong>Strength:</strong> Automatically detects and preserves the structure of complex tables with high precision. The best choice for creating datasets from well-structured documents.</li>
                                    <li><strong>Requirement:</strong> Requires an AWS account and configured credentials in your environment.</li>
                                </ul>
                            </div>
                        </div>
                        <div className="space-y-2 p-4 border rounded-lg bg-background has-[[data-state=checked]]:bg-primary/5 has-[[data-state=checked]]:border-primary">
                            <div className="flex items-center space-x-3">
                                <RadioGroupItem value="google" id="r-google" />
                                <Label htmlFor="r-google" className="text-base font-semibold">Google Cloud Vision</Label>
                            </div>
                            <div className="pl-7 text-sm space-y-2 text-muted-foreground">
                                <p><strong>Premium, high-accuracy OCR for raw text extraction.</strong> Also uses a powerful cloud service to perform recognition.</p>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li><strong>Strength:</strong> Often provides higher quality raw text recognition than Tesseract, especially for noisy or complex documents. The extracted text is then processed with the same manual structuring tools as Tesseract.</li>
                                    <li><strong>Requirement:</strong> Requires a Google Cloud Platform account with the Vision API enabled and configured credentials.</li>
                                </ul>
                            </div>
                        </div>
                        <div className="space-y-2 p-4 border rounded-lg bg-background has-[[data-state=checked]]:bg-primary/5 has-[[data-state=checked]]:border-primary">
                            <div className="flex items-center space-x-3">
                                <RadioGroupItem value="ocrspace" id="r-ocrspace" />
                                <Label htmlFor="r-ocrspace" className="text-base font-semibold">OCR.space</Label>
                            </div>
                            <div className="pl-7 text-sm space-y-2 text-muted-foreground">
                                <p><strong>A popular online OCR service with a free tier.</strong> Also uses a cloud service for recognition.</p>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li><strong>Strength:</strong> Good for general-purpose OCR and supports many languages. Often a good alternative to Tesseract with minimal setup.</li>
                                    <li><strong>Requirement:</strong> Requires an OCR.space API key. The extracted text is processed with the same manual structuring tools as Tesseract.</li>
                                </ul>
                            </div>
                        </div>
                    </RadioGroup>

                    {ocrEngine === 'tesseract' && (
                        <div className="mt-6 border-t pt-6 space-y-6">
                            <div>
                                <h3 className="text-lg font-semibold">Tesseract Configuration</h3>
                                <p className="text-sm text-muted-foreground mt-1">Configure the language and pre-processing options for the Tesseract engine.</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-6">
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="lang-en" checked={languages.includes('eng')} onCheckedChange={(checked) => handleLanguageChange('eng', checked as boolean)} />
                                    <Label htmlFor="lang-en">English (eng)</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="lang-hi" checked={languages.includes('hin')} onCheckedChange={(checked) => handleLanguageChange('hin', checked as boolean)} />
                                    <Label htmlFor="lang-hi">Hindi (hin)</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="lang-hinglish" checked={languages.includes('eng') && languages.includes('hin')} onCheckedChange={(checked) => handleLanguageChange('hinglish', checked as boolean)} />
                                    <Label htmlFor="lang-hinglish">Hinglish (eng+hin)</Label>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="char-whitelist">Character Whitelist (Advanced)</Label>
                                <Input id="char-whitelist" value={charWhitelist} onChange={(e) => setCharWhitelist(e.target.value)} className="font-mono text-xs" placeholder="Specify allowed characters for OCR" />
                                <p className="text-xs text-muted-foreground">
                                    Define the exact characters Tesseract can recognize. Pre-filled based on language selection.
                                </p>
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="opencv-api-url">OpenCV Pre-processing API URL (Optional)</Label>
                                <Input id="opencv-api-url" value={opencvApiUrl} onChange={(e) => setOpencvApiUrl(e.target.value)} placeholder="https://your-opencv-server.com/api/preprocess" />
                                <p className="text-xs text-muted-foreground">
                                   For maximum accuracy, provide an API endpoint for a server running a computer vision library (like OpenCV) to perform pre-processing (e.g., skew correction, noise removal, and structural segmentation) before Tesseract runs. The app will POST `{`imageDataUri: "data:..."`}` and expects a response with `{`processedImageDataUri: "data:..."`}`. If the API call fails, it will gracefully fall back to the original image.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="apply-binarization" checked={applyBinarization} onCheckedChange={(checked) => setApplyBinarization(checked as boolean)} />
                                    <Label htmlFor="apply-binarization">Apply basic in-browser binarization (improves contrast)</Label>
                                </div>
                                <p className="text-xs text-muted-foreground pl-6">
                                    Converts the image to black and white. This can sometimes improve OCR accuracy on low-contrast documents but may perform worse on high-quality scans.
                                </p>
                            </div>
                        </div>
                    )}

                    {ocrEngine === 'ocrspace' && (
                        <div className="mt-6 border-t pt-6 space-y-6">
                            <div>
                                <h3 className="text-lg font-semibold">OCR.space Configuration</h3>
                                <p className="text-sm text-muted-foreground mt-1">Configure your API key and language options.</p>
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="ocrspace-api-key">OCR.space API Key</Label>
                                <Input id="ocrspace-api-key" type="password" value={ocrSpaceApiKey} onChange={(e) => setOcrSpaceApiKey(e.target.value)} placeholder="Enter your OCR.space API key" />
                            </div>
                            <div className="flex flex-wrap items-center gap-6">
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="lang-en-ocrspace" checked={languages.includes('eng')} onCheckedChange={(checked) => handleLanguageChange('eng', checked as boolean)} />
                                    <Label htmlFor="lang-en-ocrspace">English (eng)</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="lang-hi-ocrspace" checked={languages.includes('hin')} onCheckedChange={(checked) => handleLanguageChange('hin', checked as boolean)} />
                                    <Label htmlFor="lang-hi-ocrspace">Hindi (hin)</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="lang-hinglish-ocrspace" checked={languages.includes('eng') && languages.includes('hin')} onCheckedChange={(checked) => handleLanguageChange('hinglish', checked as boolean)} />
                                    <Label htmlFor="lang-hinglish-ocrspace">Hinglish (eng+hin)</Label>
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

          <FileUploader onFilesAdded={onFilesAdded} />
          
          <FileList 
            files={files} 
            ocrEngine={ocrEngine}
            clearAll={clearAll}
            onDownload={generateAndDownloadExcel}
            onPageSelect={handlePageSelectionChange}
            onSelectAllPages={handleSelectAllPages}
            onStartProcessing={handleStartProcessing}
            downloadingFileId={downloadingFileId}
            onRunAiSuggestions={handleRunAiSuggestions}
            reSuggestingTaskId={reSuggestingTaskId}
            onTextChange={handleTextChange}
            onReprocess={handleReprocess}
            reprocessingFileId={reprocessingFileId}
            onReOcr={handleReOcr}
            reOcrFileId={reOcrFileId}
            onPreviewData={handlePreviewData}
            previewingFileId={previewingFileId}
            onAddTask={handleAddTask}
            onRemoveTask={handleRemoveTask}
            onUpdateTask={handleUpdateTask}
            onSetSelectionRectangles={handleSetSelectionRectangles}
          />
        </div>
      </main>

      <footer className="text-center py-6 text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} PDF to Excel OCR. All rights reserved.</p>
      </footer>
    </div>
  );
}

    