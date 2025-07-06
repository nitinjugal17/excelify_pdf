
'use server';
/**
 * @fileOverview A flow to perform OCR using Google Cloud Vision API.
 *
 * - ocrWithGoogleVision - A function that takes an image data URI and returns the extracted text.
 * - GoogleVisionInput - The input type for the flow.
 * - GoogleVisionOutput - The return type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { ImageAnnotatorClient } from "@google-cloud/vision";

const GoogleVisionInputSchema = z.object({
  imageDataUri: z.string().describe("A data URI of the image to process. Expected format: 'data:image/png;base64,<encoded_data>'."),
});
export type GoogleVisionInput = z.infer<typeof GoogleVisionInputSchema>;

const GoogleVisionOutputSchema = z.object({
  text: z.string().describe("The full text extracted from the image."),
});
export type GoogleVisionOutput = z.infer<typeof GoogleVisionOutputSchema>;

// Lazily initialized client.
let visionClient: ImageAnnotatorClient | null = null;

function getVisionClient(): ImageAnnotatorClient {
    if (visionClient) {
        return visionClient;
    }
    
    // The Google Cloud client libraries automatically use service account credentials
    // if the GOOGLE_APPLICATION_CREDENTIALS environment variable is set.
    // In a GCP environment (like Cloud Run), they use the attached service account.
    // We'll add a check to guide the user if credentials seem to be missing.
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GCP_PROJECT) {
        console.warn("Google Cloud credentials may not be configured. Please set GOOGLE_APPLICATION_CREDENTIALS or run in a GCP environment.");
    }
    
    try {
        visionClient = new ImageAnnotatorClient();
        return visionClient;
    } catch (error) {
        console.error("Failed to initialize Google Cloud Vision client:", error);
        throw new Error(`Could not initialize Google Cloud Vision client: ${(error as Error).message}. Ensure you have authenticated correctly.`);
    }
}


export async function ocrWithGoogleVision(input: GoogleVisionInput): Promise<GoogleVisionOutput> {
    const result = await googleVisionOcrFlow(input);
    return result;
}

const googleVisionOcrFlow = ai.defineFlow(
  {
    name: 'googleVisionOcrFlow',
    inputSchema: GoogleVisionInputSchema,
    outputSchema: GoogleVisionOutputSchema,
  },
  async ({ imageDataUri }) => {
    const client = getVisionClient();
    
    try {
        const base64Data = imageDataUri.split(',')[1];
        if (!base64Data) {
            throw new Error("Invalid image data URI.");
        }
        
        const request = {
            image: {
                content: base64Data,
            },
        };

        const [result] = await client.documentTextDetection(request);
        const fullTextAnnotation = result.fullTextAnnotation;
        
        if (!fullTextAnnotation || !fullTextAnnotation.text) {
             return { text: '' };
        }

        return { text: fullTextAnnotation.text };

    } catch (error) {
        console.error("Error calling Google Cloud Vision API:", error);
        // Check for common auth errors.
        if (error instanceof Error && (error.message.includes('Could not load the default credentials') || error.message.includes('permission_denied'))) {
            throw new Error("Google Cloud Vision authentication failed. Please configure your application's default credentials.");
        }
        throw new Error(`An error occurred while processing with Google Cloud Vision: ${(error as Error).message}`);
    }
  }
);
