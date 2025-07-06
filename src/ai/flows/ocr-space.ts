
'use server';
/**
 * @fileOverview A flow to perform OCR using the OCR.space API.
 *
 * - ocrWithOcrSpace - A function that takes an image data URI and API key, and returns the extracted text.
 * - OcrSpaceInput - The input type for the flow.
 * - OcrSpaceOutput - The return type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import FormData from 'form-data';

const OcrSpaceInputSchema = z.object({
  imageDataUri: z.string().describe("A data URI of the image to process. Expected format: 'data:image/png;base64,<encoded_data>'."),
  apiKey: z.string().describe("The API key for the OCR.space service."),
  language: z.string().optional().default('eng').describe("The language for OCR detection."),
});
export type OcrSpaceInput = z.infer<typeof OcrSpaceInputSchema>;

const OcrSpaceOutputSchema = z.object({
  text: z.string().describe("The full text extracted from the image."),
});
export type OcrSpaceOutput = z.infer<typeof OcrSpaceOutputSchema>;

export async function ocrWithOcrSpace(input: OcrSpaceInput): Promise<OcrSpaceOutput> {
    return ocrSpaceFlow(input);
}

const ocrSpaceFlow = ai.defineFlow(
  {
    name: 'ocrSpaceFlow',
    inputSchema: OcrSpaceInputSchema,
    outputSchema: OcrSpaceOutputSchema,
  },
  async ({ imageDataUri, apiKey, language }) => {
    if (!apiKey || apiKey.trim() === '') {
        throw new Error("OCR.space API key is missing. Please provide a valid API key.");
    }
      
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60-second timeout

    try {
        const formData = new FormData();
        formData.append('base64Image', imageDataUri);
        formData.append('apikey', apiKey);
        formData.append('language', language);
        formData.append('isOverlayRequired', 'false');
        formData.append('detectOrientation', 'true');
        formData.append('scale', 'true');
        // Use engine 2 for better results with tables
        formData.append('OCREngine', '2');


        const response = await fetch('https://api.ocr.space/parse/image', {
            method: 'POST',
            body: formData,
            signal: controller.signal, // Set the timeout signal
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`OCR.space API Error Response (Status: ${response.status}):`, errorBody);
            throw new Error(`OCR.space API request failed with status ${response.status}: ${errorBody}`);
        }

        const result = await response.json();

        if (result.IsErroredOnProcessing) {
            throw new Error(`OCR.space processing error: ${result.ErrorMessage.join(', ')}`);
        }
        
        const parsedText = result.ParsedResults?.[0]?.ParsedText || '';
        
        return { text: parsedText };

    } catch (error) {
        console.error("Full error details from OCR.space API call:", error);
        
        if (error instanceof Error) {
            if (error.name === 'AbortError') {
                throw new Error("The request to OCR.space timed out after 60 seconds. This is likely due to a large image or slow network. Please try again.");
            }

            // Check for the specific underlying Node.js fetch error cause
            if ('cause' in error && error.cause) {
                const cause = error.cause as any;
                if (cause.code === 'UND_ERR_CONNECT_TIMEOUT') {
                    throw new Error("Connection to the OCR.space API timed out. Please check your network connection and try again.");
                }
            }
            // Fallback for other fetch or processing errors
            throw new Error(`An error occurred while processing with OCR.space: ${error.message}`);
        }
        
        // Generic fallback for non-Error exceptions
        throw new Error("An unknown error occurred while processing with OCR.space.");
    } finally {
        // Important: clear the timeout to prevent it from running unnecessarily
        clearTimeout(timeoutId);
    }
  }
);
