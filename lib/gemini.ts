import { GoogleGenAI } from '@google/genai';

// Vertex AI via Application Default Credentials only — no API keys, ever.
// See docs/GEMINI-INTEGRATION.md.
let aiClient: GoogleGenAI | null = null;

export function getAiClient(): GoogleGenAI {
  if (aiClient) return aiClient;

  aiClient = new GoogleGenAI({
    enterprise: true,
    project: process.env.GOOGLE_CLOUD_PROJECT,
    location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
  });

  return aiClient;
}

export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
