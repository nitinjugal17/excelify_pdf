
"use client";

import * as React from 'react';
import type { FC } from 'react';
import { File as FileIcon, Download, AlertTriangle, Trash2, Loader2, Wand2, RefreshCw, Eye, PlusCircle, Crop } from 'lucide-react';
import type { ProcessedFile, ExtractionTask, OcrEngine } from '@/app/page';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { ScrollArea } from './ui/scroll-area';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Textarea } from './ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

interface FileListProps {
  files: ProcessedFile[];
  ocrEngine: OcrEngine;
  clearAll: () => void;
  onDownload: (file: ProcessedFile) => void;
  onPageSelect: (fileId: string, page: number, isSelected: boolean) => void;
  onSelectAllPages: (fileId: string, select: boolean) => void;
  onStartProcessing: (fileId: string) => void;
  downloadingFileId: string | null;
  onRunAiSuggestions: (fileId: string, rawText: string, taskIdToUpdate: string) => void;
  reSuggestingTaskId: string | null;
  onTextChange: (fileId: string, page: number, newText: string) => void;
  onReprocess: (fileId: string) => void;
  reprocessingFileId: string | null;
  onReOcr: (fileId: string) => void;
  reOcrFileId: string | null;
  onPreviewData: (fileId: string, taskId: string) => void;
  previewingFileId: string | null;
  onAddTask: (fileId: string) => void;
  onRemoveTask: (fileId: string, taskId: string) => void;
  onUpdateTask: (fileId: string, taskId: string, delta: Partial<ExtractionTask>) => void;
  onSetSelectionRectangles: (fileId: string, rects: { left: number; top: number; width: number; height: number; }[] | null) => void;
}

const PageSelectItem: FC<{
    fileId: string;
    preview: { page: number; imageUri: string };
    isSelected: boolean;
    onPageSelect: (fileId: string, page: number, isSelected: boolean) => void;
}> = ({ fileId, preview, isSelected, onPageSelect }) => {
  return (
    <div className="space-y-1 relative group">
        <div className="relative border rounded-md overflow-hidden shadow-sm bg-white">
            <img
                src={preview.imageUri}
                alt={`Page ${preview.page}`}
                className="w-full h-auto block"
                draggable="false"
            />
            <div className="absolute top-0 left-0 bg-black/60 text-white text-xs font-bold rounded-br-md px-1.5 py-0.5 pointer-events-none">
                {preview.page}
            </div>
            <div className="absolute top-1 right-1" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                    id={`page-${fileId}-${preview.page}`}
                    checked={isSelected}
                    onCheckedChange={(checked) => onPageSelect(fileId, preview.page, checked as boolean)}
                    className="h-6 w-6 border-white/70 bg-black/20 backdrop-blur-sm data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
            </div>
            {isSelected && (
                <div className="absolute inset-0 border-2 border-primary rounded-md pointer-events-none" />
            )}
        </div>
    </div>
  );
};

// Helper function to escape special characters for use in a regular expression.
function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const FileCardActions: FC<{
  item: ProcessedFile;
  isActionDisabled: boolean;
  isDownloading: boolean;
  isReprocessing: boolean;
  onDownload: (file: ProcessedFile) => void;
  onReprocess: (fileId: string) => void;
}> = ({ item, isActionDisabled, isDownloading, isReprocessing, onDownload, onReprocess }) => (
    <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2 shrink-0 self-start sm:self-center">
        <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onDownload(item)} disabled={isActionDisabled}>
                {isDownloading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</>
                ) : (
                    <><Download className="mr-2 h-4 w-4" />Download Excel</>
                )}
            </Button>
            <Button variant="outline" size="sm" onClick={() => onReprocess(item.id)} disabled={isActionDisabled}>
                {isReprocessing ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Starting...</>
                ) : (
                    <><RefreshCw className="mr-2 h-4 w-4" />Reprocess</>
                )}
            </Button>
        </div>
    </div>
);


export const FileList: FC<FileListProps> = ({ files, ocrEngine, clearAll, onDownload, onPageSelect, onSelectAllPages, onStartProcessing, downloadingFileId, onRunAiSuggestions, reSuggestingTaskId, onTextChange, onReprocess, reprocessingFileId, onReOcr, reOcrFileId, onPreviewData, previewingFileId, onAddTask, onRemoveTask, onUpdateTask, onSetSelectionRectangles }) => {
  const [currentPages, setCurrentPages] = React.useState<Record<string, number>>({});
  const imageContainerRef = React.useRef<HTMLDivElement>(null);
  
  const [drawingState, setDrawingState] = React.useState<{
    fileId: string;
    startX: number;
    startY: number;
  } | null>(null);

  const [mousePosition, setMousePosition] = React.useState<{
    x: number;
    y: number;
  } | null>(null);

  const handlePageChange = (fileId: string, page: number) => {
    setCurrentPages(prev => ({ ...prev, [fileId]: page }));
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>, fileId: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDrawingState({ fileId, startX: x, startY: y });
    setMousePosition({ x, y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawingState) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseUp = (
    e: React.MouseEvent<HTMLDivElement>,
    file: ProcessedFile,
    pageNumber: number
  ) => {
    if (!drawingState || !mousePosition) return;
    
    const container = e.currentTarget;
    const imageEl = container.querySelector('img');
    if (!imageEl) return;

    const drawnRect = {
        left: Math.min(drawingState.startX, mousePosition.x),
        top: Math.min(drawingState.startY, mousePosition.y),
        width: Math.abs(drawingState.startX - mousePosition.x),
        height: Math.abs(drawingState.startY - mousePosition.y),
    };

    if (drawnRect.width < 5 || drawnRect.height < 5) {
        // Selection too small, probably a misclick. Don't add it.
    } else {
        const displayWidth = imageEl.clientWidth;
        const displayHeight = imageEl.clientHeight;
        
        const originalDimensions = file.pageImageDimensions?.[pageNumber - 1];
        if (!originalDimensions) return;
        
        const originalWidth = originalDimensions.width;
        const originalHeight = originalDimensions.height;

        const scaledRect = {
            left: Math.round((drawnRect.left / displayWidth) * originalWidth),
            top: Math.round((drawnRect.top / displayHeight) * originalHeight),
            width: Math.round((drawnRect.width / displayWidth) * originalWidth),
            height: Math.round((drawnRect.height / displayHeight) * originalHeight),
        };
        const existingRects = file.selectionRectangles || [];
        onSetSelectionRectangles(file.id, [...existingRects, scaledRect]);
    }

    setDrawingState(null);
    setMousePosition(null);
  };

  if (files.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Step 3: Process Files &amp; Download</CardTitle>
        {files.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
                <Trash2 className="mr-2 h-4 w-4" />
                Clear All
            </Button>
        )}
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {files.map((item) => {
            const isDownloading = downloadingFileId === item.id;
            const isReprocessing = reprocessingFileId === item.id;
            const isReOcrRunning = reOcrFileId === item.id;
            const isActionDisabled = isDownloading || !!reSuggestingTaskId || isReprocessing || !!previewingFileId || isReOcrRunning || item.status === 'processing';

            const sortedExtractedData = item.extractedData ? [...item.extractedData].sort((a,b) => a.page - b.page) : [];
            const totalPages = sortedExtractedData.length;
            const currentPageNumber = currentPages[item.id] || (sortedExtractedData.length > 0 ? sortedExtractedData[0].page : 1);
            
            let pageData, pageImage, pageIndex;

            if (totalPages > 0) {
                pageIndex = sortedExtractedData.findIndex(p => p.page === currentPageNumber);
                if (pageIndex === -1) pageIndex = 0; // Fallback to first page
                pageData = sortedExtractedData[pageIndex];
                if (pageData) {
                    // Find the original page image using the absolute page number
                    pageImage = item.pageImages?.[pageData.page - 1];
                }
            }
            
            return (
              <li key={item.id} className="p-4 border rounded-lg flex flex-col gap-4 transition-all">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <FileIcon className="h-10 w-10 text-primary shrink-0" />
                  <div className="flex-1 w-full overflow-hidden">
                    <p className="font-medium truncate text-sm">{item.file.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{(item.file.size / 1024).toFixed(2)} KB</span>
                      <StatusBadge status={item.status} engine={item.ocrEngine} />
                    </div>
                    <FileProgress item={item} />
                    {item.status === 'error' && (
                      <div className="text-destructive text-xs mt-1 flex items-center gap-2">
                        <AlertTriangle className="h-3 w-3" />
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="truncate">Error: {item.error}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{item.error}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    )}
                  </div>
                    {item.status === 'completed' && (
                        <FileCardActions 
                            item={item} 
                            isActionDisabled={isActionDisabled} 
                            isDownloading={isDownloading}
                            isReprocessing={isReprocessing}
                            onDownload={onDownload}
                            onReprocess={onReprocess}
                        />
                    )}
                    {item.status === 'error' && (
                        <Button variant="outline" size="sm" onClick={() => onReprocess(item.id)} disabled={isReprocessing}>
                            {isReprocessing ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Starting...</>
                            ) : (
                                <><RefreshCw className="mr-2 h-4 w-4" />Try Again</>
                            )}
                        </Button>
                    )}
                </div>
                
                {item.analysis && (
                    <Alert>
                        <Wand2 className="h-4 w-4" />
                        <AlertTitle>{item.ocrEngine === 'textract' ? 'Textract Analysis' : 'AI Analysis & Suggestions'}</AlertTitle>
                        <AlertDescription>
                            {item.analysis}
                        </AlertDescription>
                    </Alert>
                )}

                {item.status === 'awaiting-selection' && item.pagePreviews && (
                  <div className="mt-4 space-y-4">
                      <div>
                        <h4 className="font-semibold text-sm">Step 3.1: Select Pages to Process</h4>
                        <p className="text-xs text-muted-foreground">{item.selectedPages.size} of {item.totalPages} pages selected.</p>
                      </div>
                      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                          <div>
                          </div>
                          <div className="flex gap-2">
                              <Button variant="outline" size="sm" onClick={() => onSelectAllPages(item.id, true)}>Select All</Button>
                              <Button variant="outline" size="sm" onClick={() => onSelectAllPages(item.id, false)}>Deselect All</Button>
                          </div>
                      </div>
                      <ScrollArea className="h-96 w-full rounded-md border p-2 bg-muted/20">
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-2">
                              {item.pagePreviews.map(preview => (
                                <PageSelectItem
                                    key={preview.page}
                                    fileId={item.id}
                                    preview={preview}
                                    isSelected={item.selectedPages.has(preview.page)}
                                    onPageSelect={onPageSelect}
                                />
                              ))}
                          </div>
                      </ScrollArea>
                      
                      <div className="border-t pt-4">
                          <h4 className="font-semibold text-sm">Step 3.2: Start Processing</h4>
                          <p className="text-xs text-muted-foreground mb-2">Once pages are selected, click below to start the OCR process with the chosen engine.</p>
                          <Button onClick={() => onStartProcessing(item.id)} disabled={item.selectedPages.size === 0}>
                              Process {item.selectedPages.size} Selected Page(s)
                          </Button>
                      </div>
                  </div>
                )}
                
                {(item.ocrEngine === 'tesseract' || item.ocrEngine === 'google' || item.ocrEngine === 'ocrspace') && item.extractedData && item.extractedData.length > 0 && (
                  <Accordion type="single" collapsible className="w-full" defaultValue="item-1">
                    <AccordionItem value="item-1">
                      <AccordionTrigger className="text-sm py-2">
                        Review &amp; Edit Raw Extracted Data ({totalPages} page{totalPages > 1 ? 's' : ''} processed)
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="flex flex-wrap items-center justify-center gap-4 mb-4">
                            {totalPages > 1 && (
                                <div className="flex items-center gap-2">
                                    <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handlePageChange(item.id, sortedExtractedData[Math.max(0, (pageIndex ?? 0) - 1)].page)}
                                    disabled={(pageIndex ?? 0) <= 0}
                                    >
                                    Previous
                                    </Button>
                                    <span className="text-sm text-muted-foreground">
                                    Page {pageData?.page}
                                    </span>
                                    <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handlePageChange(item.id, sortedExtractedData[Math.min(totalPages - 1, (pageIndex ?? 0) + 1)].page)}
                                    disabled={(pageIndex ?? 0) >= totalPages - 1}
                                    >
                                    Next
                                    </Button>
                                </div>
                            )}
                        </div>

                        <div className="border rounded-lg p-2 bg-muted/30">
                          {pageData && pageIndex !== undefined && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div
                                className="h-[600px] overflow-hidden rounded-md border bg-white flex items-center justify-center relative cursor-crosshair"
                                ref={imageContainerRef}
                                onMouseDown={(e) => ocrEngine === 'tesseract' && handleMouseDown(e, item.id)}
                                onMouseMove={(e) => ocrEngine === 'tesseract' && handleMouseMove(e)}
                                onMouseUp={(e) => ocrEngine === 'tesseract' && handleMouseUp(e, item, pageData.page)}
                                onMouseLeave={() => ocrEngine === 'tesseract' && setDrawingState(null)}
                              >
                                {pageImage ? (
                                    <img src={pageImage} alt={`Page ${pageData.page} preview`} className="w-full h-full object-contain pointer-events-none" />
                                ) : (
                                  <div className="text-sm text-muted-foreground p-4">
                                      Image preview not available.
                                  </div>
                                )}
                                
                                {drawingState && drawingState.fileId === item.id && mousePosition && (() => {
                                      const rect = {
                                        left: Math.min(drawingState.startX, mousePosition.x),
                                        top: Math.min(drawingState.startY, mousePosition.y),
                                        width: Math.abs(drawingState.startX - mousePosition.x),
                                        height: Math.abs(drawingState.startY - mousePosition.y),
                                      };
                                      return (
                                        <div
                                          className="absolute border-2 border-dashed border-primary bg-primary/20 pointer-events-none"
                                          style={{
                                            left: rect.left,
                                            top: rect.top,
                                            width: rect.width,
                                            height: rect.height,
                                          }}
                                        />
                                      );
                                })()}
                                
                                {item.selectionRectangles?.map((rect, index) => {
                                    const imageEl = imageContainerRef.current?.querySelector('img');
                                    const originalDimensions = item.pageImageDimensions?.[pageData.page - 1];
                                    
                                    if (!imageEl || !originalDimensions) return null;

                                    const displayWidth = imageEl.clientWidth;
                                    const displayHeight = imageEl.clientHeight;
                                    const {width: originalWidth, height: originalHeight} = originalDimensions;
                                    
                                    const displayRect = {
                                      left: (rect.left / originalWidth) * displayWidth,
                                      top: (rect.top / originalHeight) * displayHeight,
                                      width: (rect.width / originalWidth) * displayWidth,
                                      height: (rect.height / originalHeight) * displayHeight,
                                    };

                                    return (
                                      <div
                                        key={index}
                                        className="absolute border-2 border-primary pointer-events-none"
                                        style={displayRect}
                                      />
                                    );
                                })}

                              </div>
                              <ScrollArea className="h-[600px] rounded-md border bg-background">
                                <Textarea
                                  className="h-full min-h-[580px] w-full resize-none rounded-none border-0 bg-transparent p-2 font-mono text-xs focus-visible:ring-0"
                                  value={item.manuallyEditedPages?.get(pageData.page) ?? pageData.tsv}
                                  onChange={(e) => onTextChange(item.id, pageData.page, e.target.value)}
                                  placeholder="No text found on this page. You can manually enter or correct text here."
                                />
                              </ScrollArea>
                            </div>
                          )}
                        </div>
                        {ocrEngine === 'tesseract' && (
                            <div className="mt-4 border-t pt-4 space-y-4">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <Crop className="h-4 w-4 text-primary" />
                                        <h4 className="font-semibold text-sm">Refine with Region Selection</h4>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">If the text is messy, draw boxes on the image above around the areas you want to extract and re-run the OCR. This focuses Tesseract on specific parts of the document, dramatically improving accuracy.</p>
                                </div>
                                
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Button 
                                        size="sm"
                                        onClick={() => onReOcr(item.id)} 
                                        disabled={!item.selectionRectangles || item.selectionRectangles.length === 0 || isActionDisabled}
                                    >
                                        {isReOcrRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                        {isReOcrRunning ? 'Processing...' : `Re-run OCR on ${item.selectionRectangles?.length || 0} Region(s)`}
                                    </Button>
                                    {item.selectionRectangles && item.selectionRectangles.length > 0 && (
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            onClick={() => onSetSelectionRectangles(item.id, null)}
                                            disabled={isActionDisabled}
                                        >
                                            Clear Selections
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                )}

                {item.status === 'completed' && (item.ocrEngine === 'tesseract' || item.ocrEngine === 'google' || item.ocrEngine === 'ocrspace') && (
                  <div className="space-y-4 pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-sm">Extraction Tasks</h4>
                        <p className="text-xs text-muted-foreground">Define one or more sets of rules to extract data into separate sheets.</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => onAddTask(item.id)}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Add Task
                      </Button>
                    </div>

                    {item.extractionTasks.map((task, taskIndex) => {
                      const isPreviewingTask = previewingFileId === `${item.id}-${task.id}`;
                      const isReSuggestingTask = reSuggestingTaskId === task.id;
                      const correctionMismatch = (task.findValues.split(',').filter(Boolean).length > 0 || task.replaceValues.split(',').filter(Boolean).length > 0) && (task.findValues.split(',').length !== task.replaceValues.split(',').length);
                      
                      return (
                        <Card key={task.id} className="bg-background">
                          <CardHeader className="flex-row items-center gap-4 space-y-0 p-4 border-b">
                            <div className="flex-1 space-y-1">
                              <Label htmlFor={`task-name-${task.id}`} className="text-xs">Task Name (for Excel Sheet)</Label>
                              <Input
                                id={`task-name-${task.id}`}
                                value={task.name}
                                onChange={(e) => onUpdateTask(item.id, task.id, { name: e.target.value })}
                                className="h-8"
                              />
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onRemoveTask(item.id, task.id)}
                              disabled={item.extractionTasks.length <= 1}
                              className="self-end"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                              <span className="sr-only">Remove Task</span>
                            </Button>
                          </CardHeader>
                          <CardContent className="p-4">
                             <div className="mb-4">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => onRunAiSuggestions(item.id, pageData?.tsv || '', task.id)}
                                  disabled={isActionDisabled || !pageData?.tsv?.trim() || isReSuggestingTask}
                                >
                                  {isReSuggestingTask ? (
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                      <Wand2 className="mr-2 h-4 w-4" />
                                  )}
                                  {isReSuggestingTask ? 'Generating...' : 'Get AI Suggestions for this Task'}
                                </Button>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Analyzes the text from the currently selected page preview above to suggest rules.
                                </p>
                              </div>

                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="space-y-1.5 md:col-span-2">
                                    <Label htmlFor={`columns-${task.id}`} className="text-xs font-medium">Data Keys (Headers)</Label>
                                    <Input 
                                        id={`columns-${task.id}`}
                                        type="text"
                                        placeholder="e.g. Voter ID, Name, Age"
                                        className="h-9"
                                        value={task.columnHeaders}
                                        onChange={(e) => onUpdateTask(item.id, task.id, { columnHeaders: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1.5 md:col-span-2">
                                    <Label htmlFor={`separators-${task.id}`} className="text-xs font-medium">Column Separator</Label>
                                    <Input 
                                        id={`separators-${task.id}`}
                                        type="text"
                                        placeholder="e.g., a comma , or a tab \t"
                                        className="h-9"
                                        value={task.columnSeparators}
                                        onChange={(e) => onUpdateTask(item.id, task.id, { columnSeparators: e.target.value })}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Provide the character that separates columns (use `\t` for tab).
                                    </p>
                                </div>
                                <div className="space-y-1.5 md:col-span-2">
                                    <Label htmlFor={`eliminators-${task.id}`} className="text-xs font-medium">Junk Eliminators (Keywords)</Label>
                                    <Input 
                                        id={`eliminators-${task.id}`}
                                        type="text"
                                        placeholder="e.g. Page No., Election Commission"
                                        className="h-9"
                                        value={task.eliminators}
                                        onChange={(e) => onUpdateTask(item.id, task.id, { eliminators: e.target.value })}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Comma-separated keywords to remove entire rows containing them.
                                    </p>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor={`find-${task.id}`} className="text-xs font-medium">Find (comma-separated)</Label>
                                    <Input
                                        id={`find-${task.id}`}
                                        type="text"
                                        placeholder="e.g. O, l, S"
                                        className="h-9"
                                        value={task.findValues}
                                        onChange={(e) => onUpdateTask(item.id, task.id, { findValues: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor={`replace-${task.id}`} className="text-xs font-medium">Replace With (comma-separated)</Label>
                                    <Input
                                        id={`replace-${task.id}`}
                                        type="text"
                                        placeholder="e.g. 0, 1, 5"
                                        className="h-9"
                                        value={task.replaceValues}
                                        onChange={(e) => onUpdateTask(item.id, task.id, { replaceValues: e.target.value })}
                                    />
                                </div>
                                <div className="md:col-span-2 -mt-2">
                                  <p className="text-xs text-muted-foreground">
                                    Use this to automatically correct common OCR errors (e.g., replace 'O' with '0', 'l' with '1').
                                  </p>
                                  {correctionMismatch && (
                                    <p className="text-xs text-destructive mt-1">
                                      Warning: The number of 'Find' and 'Replace' items must match for corrections to be applied.
                                    </p>
                                  )}
                                </div>
                            </div>
                            <div className="mt-4">
                                <Button size="sm" variant="outline" onClick={() => onPreviewData(item.id, task.id)} disabled={isActionDisabled}>
                                    {isPreviewingTask ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Previewing...</>
                                    ) : (
                                        <><Eye className="mr-2 h-4 w-4" />Preview Data</>
                                    )}
                                </Button>
                            </div>

                            {task.structuredDataPreview && (
                              <div className="mt-4">
                                <h4 className="font-semibold mb-2 text-sm">Structured Data Preview</h4>
                                {task.structuredDataPreview.length > 0 ? (
                                  <ScrollArea className="h-60 w-full rounded-md border">
                                      <Table className="bg-white">
                                          <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                                              <TableRow>
                                                  {Object.keys(task.structuredDataPreview[0]).map(h => <TableHead key={h}>{h}</TableHead>)}
                                              </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                              {task.structuredDataPreview.map((row, i) => (
                                                  <TableRow key={i}>
                                                      {Object.keys(row).map(h => (
                                                          <TableCell key={h} className="text-xs">{row[h]}</TableCell>
                                                      ))}
                                                  </TableRow>
                                              ))}
                                          </TableBody>
                                      </Table>
                                  </ScrollArea>
                                ) : (
                                  <div className="text-center text-sm text-muted-foreground border rounded-md p-6">
                                    No structured data could be extracted with the current rules for this task.
                                  </div>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )}

                {item.status === 'completed' && item.ocrEngine === 'textract' && item.structuredDataPreview && (
                  <div className="mt-4">
                    <h4 className="font-semibold mb-2 text-sm">Extracted Table Data</h4>
                    {item.structuredDataPreview.length > 0 ? (
                      <ScrollArea className="h-80 w-full rounded-md border">
                          <Table className="bg-white">
                              <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                                  <TableRow>
                                      {Object.keys(item.structuredDataPreview[0]).map(h => <TableHead key={h}>{h}</TableHead>)}
                                  </TableRow>
                              </TableHeader>
                              <TableBody>
                                  {item.structuredDataPreview.map((row, i) => (
                                      <TableRow key={i}>
                                          {Object.keys(row).map(h => (
                                              <TableCell key={h} className="text-xs">{row[h]}</TableCell>
                                          ))}
                                      </TableRow>
                                  ))}
                              </TableBody>
                          </Table>
                      </ScrollArea>
                    ) : (
                      <div className="text-center text-sm text-muted-foreground border rounded-md p-8">
                        Textract could not detect a table on the selected pages.
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
};

const FileProgress: FC<{item: ProcessedFile}> = ({item}) => {
    const { status, progress } = item;
    if (status === 'pending' || status === 'awaiting-selection') return <Progress value={progress} className="mt-2 h-1.5" />;
    if (status === 'processing') return <Progress value={progress} className="mt-2 h-1.5" />;
    if (status === 'completed') return <Progress value={100} className="mt-2 h-1.5" />;
    return null;
}

const StatusBadge: FC<{ status: ProcessedFile['status'], engine: ProcessedFile['ocrEngine'] }> = ({ status, engine }) => {
  const engineName = engine === 'textract' ? 'Textract' : engine === 'google' ? 'Google Vision' : engine === 'ocrspace' ? 'OCR.space' : 'Tesseract';
  switch (status) {
    case 'pending':
      return <Badge variant="secondary">Generating Previews...</Badge>;
    case 'awaiting-selection':
      return <Badge variant="outline">Awaiting Page Selection</Badge>;
    case 'processing':
      return <Badge variant="secondary">Processing with {engineName}...</Badge>;
    case 'completed':
      return <Badge variant="default" className="bg-green-600/80 hover:bg-green-600 text-white">{engine === 'textract' ? 'Completed &amp; Structured' : 'Ready for Review &amp; Structuring'}</Badge>;
    case 'error':
      return <Badge variant="destructive">Error</Badge>;
    default:
      return null;
  }
};
