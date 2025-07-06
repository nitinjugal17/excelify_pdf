
'use server';
/**
 * @fileOverview A flow to perform structured table extraction using Amazon Textract.
 *
 * - extractTableWithTextract - A function that takes an image data URI and returns structured table data.
 * - TextractInput - The input type for the flow.
 * - TextractOutput - The return type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { TextractClient, AnalyzeDocumentCommand, Block, FeatureType } from "@aws-sdk/client-textract";

const TextractInputSchema = z.object({
  imageDataUri: z.string().describe("A data URI of the image to process. Expected format: 'data:image/png;base64,<encoded_data>'."),
});
export type TextractInput = z.infer<typeof TextractInputSchema>;

const TextractOutputSchema = z.object({
  structuredData: z.array(z.record(z.string())).describe("An array of objects, where each object represents a row of extracted table data."),
});
export type TextractOutput = z.infer<typeof TextractOutputSchema>;

// Lazily initialized Textract client to avoid blocking server startup.
let textractClient: TextractClient | null = null;

function getTextractClient(): TextractClient {
    if (textractClient) {
        return textractClient;
    }

    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_DEFAULT_REGION) {
        throw new Error("AWS credentials are not configured. Please set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_DEFAULT_REGION in your environment variables.");
    }
    
    try {
        textractClient = new TextractClient({ region: process.env.AWS_DEFAULT_REGION });
        return textractClient;
    } catch (error) {
        console.error("Failed to initialize AWS Textract client:", error);
        // We throw here because if initialization fails, subsequent calls would also fail.
        throw new Error(`Could not initialize AWS Textract client: ${(error as Error).message}`);
    }
}


export async function extractTableWithTextract(input: TextractInput): Promise<Record<string, string>[]> {
    const result = await textractTableFlow(input);
    return result.structuredData;
}

const textractTableFlow = ai.defineFlow(
  {
    name: 'textractTableFlow',
    inputSchema: TextractInputSchema,
    outputSchema: TextractOutputSchema,
  },
  async ({ imageDataUri }) => {
    const client = getTextractClient();
    
    try {
        const base64Data = imageDataUri.split(',')[1];
        if (!base64Data) {
            throw new Error("Invalid image data URI.");
        }
        const imageBytes = Buffer.from(base64Data, 'base64');

        const command = new AnalyzeDocumentCommand({
            Document: { Bytes: imageBytes },
            FeatureTypes: [FeatureType.TABLES],
        });

        const response = await client.send(command);
        const blocks = response.Blocks;

        if (!blocks) {
            return { structuredData: [] };
        }
        
        const tableBlocks = blocks.filter(b => b.BlockType === 'TABLE');
        if (tableBlocks.length === 0) {
            return { structuredData: [] };
        }

        const table = tableBlocks[0];
        const tableCellIds = new Set(table?.Relationships?.find(r => r.Type === 'CHILD')?.Ids);
        if (!tableCellIds) {
            return { structuredData: [] };
        }
        
        const cells = blocks.filter(b => b.BlockType === 'CELL' && b.Id && tableCellIds.has(b.Id));
        
        const wordsById = blocks.filter(b => b.BlockType === 'WORD').reduce((acc, word) => {
            if (word.Id) acc[word.Id] = word;
            return acc;
        }, {} as Record<string, Block>);

        const getCellText = (cell: Block): string => {
            let text = '';
            if (cell.Relationships) {
                for (const rel of cell.Relationships) {
                    if (rel.Type === 'CHILD' && rel.Ids) {
                        for (const id of rel.Ids) {
                            const word = wordsById[id];
                            if (word?.Text) {
                                text += word.Text + ' ';
                            }
                        }
                    }
                }
            }
            return text.trim();
        };

        const tableData: { [rowIndex: number]: { [colIndex: number]: string } } = {};
        let maxRow = 0;
        let maxCol = 0;

        for (const cell of cells) {
            if (cell.RowIndex && cell.ColumnIndex) {
                const r = cell.RowIndex;
                const c = cell.ColumnIndex;
                if (!tableData[r]) tableData[r] = {};
                tableData[r][c] = getCellText(cell);
                maxRow = Math.max(maxRow, r);
                maxCol = Math.max(maxCol, c);
            }
        }
        
        const rowsAsArrays: string[][] = [];
        for (let r = 1; r <= maxRow; r++) {
            const row: string[] = [];
            for (let c = 1; c <= maxCol; c++) {
                row.push(tableData[r]?.[c] || '');
            }
            rowsAsArrays.push(row);
        }

        if (rowsAsArrays.length < 1) {
            return { structuredData: [] };
        }
        
        const headers = rowsAsArrays.length > 1 ? rowsAsArrays.shift()! : rowsAsArrays[0].map((_, i) => `Column ${i + 1}`);
        const dataRows = rowsAsArrays.length > 1 ? rowsAsArrays : [[]];

        if (rowsAsArrays.length === 1) return { structuredData: [] }; // Only headers, no data

        const structuredData = dataRows.map(row => {
            const rowObject: Record<string, string> = {};
            headers.forEach((header, index) => {
                rowObject[header] = row[index] || '';
            });
            return rowObject;
        });
        
        return { structuredData };

    } catch (error) {
        console.error("Error calling Amazon Textract:", error);
        if (error instanceof Error && (error.name === 'AccessDeniedException' || error.name === 'InvalidSignatureException')) {
            throw new Error("Amazon Textract authentication failed. Please verify your AWS credentials.");
        }
        throw new Error(`An error occurred while processing with Amazon Textract: ${(error as Error).message}`);
    }
  }
);
