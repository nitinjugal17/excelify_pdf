
'use server';
/**
 * @fileOverview An AI flow to analyze raw OCR data and suggest cleaning rules.
 *
 * - suggestCleaningRules - A function that takes raw text and suggests headers and junk eliminators.
 * - SuggestCleaningRulesInput - The input type for the suggestCleaningRules function.
 * - SuggestCleaningRulesOutput - The return type for the suggestCleaningRules function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestCleaningRulesInputSchema = z.object({
  rawText: z.string().describe('The raw text extracted from a document page by OCR.'),
});
export type SuggestCleaningRulesInput = z.infer<typeof SuggestCleaningRulesInputSchema>;

const SuggestCleaningRulesOutputSchema = z.object({
  suggestedHeaders: z.string().describe('A comma-separated list of suggested column headers based on the text. Should be empty if no clear headers are found.'),
  suggestedEliminators: z.string().describe('A comma-separated list of suggested keywords to eliminate junk rows. Focus on recurring, non-data text like page numbers, footers, or watermarks. Should be empty if no obvious junk is found.'),
  suggestedFindValues: z.string().describe('A comma-separated list of common OCR errors to find.'),
  suggestedReplaceValues: z.string().describe('A comma-separated list of corrected values to replace the errors with. Must have the same number of items as suggestedFindValues.'),
  analysis: z.string().describe('A brief, one or two-sentence analysis of what the document content appears to be about.'),
});
export type SuggestCleaningRulesOutput = z.infer<typeof SuggestCleaningRulesOutputSchema>;


export async function suggestCleaningRules(input: SuggestCleaningRulesInput): Promise<SuggestCleaningRulesOutput> {
  // If there's no raw text, don't bother calling the AI.
  if (!input.rawText.trim()) {
      return { suggestedHeaders: '', suggestedEliminators: '', analysis: 'No text was found on this page.', suggestedFindValues: '', suggestedReplaceValues: '' };
  }

  // The flow now handles its own potential failures, so we can call it directly.
  return await suggestCleaningRulesFlow(input);
}

const suggestionPrompt = ai.definePrompt({
  name: 'suggestionPrompt',
  input: { schema: SuggestCleaningRulesInputSchema },
  output: { schema: SuggestCleaningRulesOutputSchema },
  prompt: `You are an expert data analyst specializing in Indian electoral rolls. Your task is to analyze raw OCR text from a voter list and suggest rules for cleaning and extraction. These documents often have a mix of Hindi (Devanagari script) and English (for Voter IDs).

You MUST output your response as a valid JSON object that adheres to the defined schema.
Do NOT add any text, formatting, or markdown like \`\`\`json before or after the JSON object.

Analyze the provided "rawText" and perform the following tasks:

1.  **suggestedHeaders**: Based on the typical structure of an Indian voter roll, suggest the most likely data fields. DO NOT look for a single header row. Instead, identify the labels for individual data points. Your primary goal is to suggest a comprehensive list of columns that should be in the final structured data. Common headers include: \`Voter ID\`, \`Name\`, \`Father Name\`, \`Husband Name\`, \`House Number\`, \`Age\`, \`Gender\`. Analyze the text to see which of these (or similar labels) are present and return them as a comma-separated string.

2.  **suggestedEliminators**: Identify recurring text that is part of the document's template but not part of the voter data itself. This could include things like "Page No.", "Election Commission of India", section titles, or column headers that are repeated unnecessarily in the OCR text. Return these as a comma-separated string.

3.  **suggestedFindValues & suggestedReplaceValues**: This is a critical step. Perform contextual error correction. Identify common OCR mistakes in the Hindi text. For example, a common error is recognizing "राम" (Ram) as "शम" (Sham). Look for words that are valid but unlikely in the context of a voter roll name or address. Provide a comma-separated list of incorrect words in \`suggestedFindValues\` and a corresponding comma-separated list of corrected words in \`suggestedReplaceValues\`. The number of items in both lists MUST be identical. If no obvious errors are found, return empty strings for both.

4.  **analysis**: Provide a brief, one or two-sentence summary confirming that the document appears to be a voter roll and mentioning the languages detected.

Raw OCR Text:
{{{rawText}}}
`,
  config: {
    safetySettings: [
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_NONE',
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_NONE',
      },
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_NONE',
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_NONE',
      },
    ],
  },
});

const suggestCleaningRulesFlow = ai.defineFlow(
  {
    name: 'suggestCleaningRulesFlow',
    inputSchema: SuggestCleaningRulesInputSchema,
    outputSchema: SuggestCleaningRulesOutputSchema,
  },
  async (input) => {
    try {
      const { output } = await suggestionPrompt(input);
      // If the model fails to produce structured output, it may return null.
      if (!output) {
          console.warn("AI suggestion generation failed because the model did not produce structured output.");
          return {
              suggestedHeaders: '',
              suggestedEliminators: '',
              suggestedFindValues: '',
              suggestedReplaceValues: '',
              analysis: 'AI analysis failed for this page. The model could not structure the data from the provided text. This can happen with very messy OCR results. Please try a different page with a clearer table structure, or define the headers and eliminators manually.'
          };
      }
      return output;
    } catch (e) {
      // Catch any other potential errors from the Genkit call and fall back to a safe response.
      console.error("An unexpected error occurred during AI suggestion generation:", e);
      return {
          suggestedHeaders: '',
          suggestedEliminators: '',
          suggestedFindValues: '',
          suggestedReplaceValues: '',
          analysis: 'An unexpected error occurred during AI analysis. Please try again or define rules manually.'
      };
    }
  }
);
    
