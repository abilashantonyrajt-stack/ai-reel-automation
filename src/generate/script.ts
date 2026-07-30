import OpenAI from 'openai';
import type { ReelScript } from '../types.js';

const SYSTEM_PROMPT = `You are a creative Instagram Reel scriptwriter for luxury jewelry brands.
Your job is to create compelling, viral-ready reel scripts that convert viewers into customers.

For each request, output ONLY valid JSON with this structure:
{
  "hook": "An attention-grabbing first 3 seconds hook text",
  "scenes": [
    {
      "description": "Visual description of the scene",
      "imagePrompt": "Detailed prompt for AI image generation, include jewelry details, lighting, mood",
      "textOverlay": "Text to display on screen during this scene",
      "duration": 3.0
    }
  ],
  "callToAction": "The CTA text (e.g., 'Shop now at link in bio')",
  "captions": "Full caption text for the Instagram post",
  "hashtags": ["#luxuryjewelry", "#handmade", etc]
}

Rules:
- 3-6 scenes maximum
- Each scene 2-4 seconds
- Image prompts should be detailed (subject, lighting, composition, mood)
- Captions should be engaging with emojis
- 8-15 relevant hashtags
- Hook must be under 10 words and create curiosity`;

export async function generateScript(
  prompt: string,
  options?: { brandName?: string; style?: string }
): Promise<ReelScript> {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });

  const userPrompt = [
    `Topic: ${prompt}`,
    options?.brandName && `Brand: ${options.brandName}`,
    options?.style && `Style/Mood: ${options.style}`,
  ]
    .filter(Boolean)
    .join('\n');

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.8,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('No response from AI');

  const script = JSON.parse(content) as ReelScript;
  return script;
}
