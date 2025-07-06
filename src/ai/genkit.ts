
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

// Initialize Genkit and configure the Google AI plugin.
// This object will be used to define flows, prompts, and other Genkit constructs.
export const ai = genkit({
  plugins: [
    googleAI(),
  ],
  // We recommend using a logger in production.
  // logLevel: 'debug',
  // We recommend using a tracer in production.
  // enableTracing: true,
});
