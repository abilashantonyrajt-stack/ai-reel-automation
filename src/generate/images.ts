import Replicate from 'replicate';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import type { Scene, GeneratedImage } from '../types.js';

const OUTPUT_DIR = path.resolve('output/images');

export function hasImageProvider(): boolean {
  if (process.env.REPLICATE_API_TOKEN) return true;
  const baseUrl = process.env.OPENAI_BASE_URL || '';
  const isOmniRoute = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');
  const hasKey = !!process.env.OPENAI_API_KEY;
  return hasKey && !isOmniRoute;
}

function enhancePrompt(prompt: string): string {
  const base = 'Ultra-realistic, 4K, professional product photography, ';
  const style = 'soft natural lighting, shallow depth of field, warm gold tones, elegant luxury aesthetic';
  return `${base}${prompt}, ${style}`;
}

async function downloadImage(url: string, filePath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download: ${response.statusText}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(filePath, buffer);
}

function getProvider() {
  if (process.env.REPLICATE_API_TOKEN) {
    const client = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
    return {
      generate: async (prompt: string) => {
        const model = (process.env.REPLICATE_IMAGE_MODEL || 'black-forest-labs/flux-dev') as `${string}/${string}`;
        const output = await client.run(model, {
          input: {
            prompt: enhancePrompt(prompt),
            num_outputs: 1,
            aspect_ratio: '9:16',
            output_format: 'png',
          },
        });
        return String(Array.isArray(output) ? output[0] : output);
      },
    };
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
  return {
    generate: async (prompt: string) => {
      const response = await client.images.generate({
        model: process.env.OPENAI_IMAGE_MODEL || 'dall-e-3',
        prompt: enhancePrompt(prompt),
        n: 1,
        size: '1024x1792',
        quality: 'standard',
      });
      const url = response.data?.[0]?.url;
      if (!url) throw new Error('No image generated');
      return url;
    },
  };
}

export async function generateImages(scenes: Scene[]): Promise<GeneratedImage[]> {
  const provider = getProvider();

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const results: GeneratedImage[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const url = await provider.generate(scene.imagePrompt);

    const fileName = `scene-${String(i + 1).padStart(2, '0')}.png`;
    const filePath = path.join(OUTPUT_DIR, fileName);

    console.log(`  Downloading scene ${i + 1} of ${scenes.length}...`);
    await downloadImage(url, filePath);

    results.push({ url: filePath, sceneIndex: i, altText: scene.imagePrompt });
  }

  return results;
}
