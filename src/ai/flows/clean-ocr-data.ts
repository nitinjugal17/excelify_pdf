'use server';
/**
 * @fileOverview A deterministic parser for converting raw OCR text into structured data.
 *
 * - cleanOcrData - A function that takes raw text, headers, and a separator and returns structured data.
 * - CleanOcrDataInput - The input type for the cleanOcrData function.
 * - CleanOcrDataOutput - The return type for the cleanOcrData function.
 */

import { z } from 'zod';

export const CleanOcrDataInputSchema = z.object({
  rawText: z.string().describe('The raw OCR text to be parsed.'),
  headersString: z.string().describe('A comma-separated string of column headers.'),
  separator: z.string().describe('The character or string used to separate columns.'),
});
export type CleanOcrDataInput = z.infer<typeof CleanOcrDataInputSchema>;

export const CleanOcrDataOutputSchema = z.object({
    structuredData: z.array(z.record(z.string())).describe("An array of objects, where each object represents a row of extracted table data."),
});
export type CleanOcrDataOutput = z.infer<typeof CleanOcrDataOutputSchema>;

/**
 * A simple, deterministic parser that does not use a large language model.
 * It structures raw text into an array of objects based on provided headers and a separator.
 * @param input The data containing raw text, headers, and separator.
 * @returns An object containing the structured data.
 */
export async function cleanOcrData(input: CleanOcrDataInput): Promise<CleanOcrDataOutput> {
    const { rawText, headersString, separator } = input;
    const headers = headersString.split(',').map(h => h.trim()).filter(Boolean);
    
    if (headers.length === 0) {
        return { structuredData: [] };
    }

    const lines = rawText.split('\n').filter(line => line.trim() !== '');

    const structuredData = lines.map(line => {
        const values = line.split(separator);
        const rowObject: Record<string, string> = {};
        headers.forEach((header, index) => {
            rowObject[header] = values[index]?.trim() || '';
        });
        return rowObject;
    }).filter(obj => Object.values(obj).some(v => v.length > 0));

    return { structuredData };
}
