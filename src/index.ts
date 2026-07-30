#!/usr/bin/env node

import { program } from 'commander';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env') });

import { generateScript } from './generate/script.js';
import { generateImages, hasImageProvider } from './generate/images.js';
import { compileReel, addAudio } from './generate/video.js';
import { uploadReel } from './upload/instagram.js';
import type { ReelConfig, UploadMethod } from './types.js';

const VERSION = '1.0.0';

program
  .name('create-reel')
  .description('AI workflow automation for Instagram Reels')
  .version(VERSION);

// ── Full pipeline: prompt → script → images → video → upload ──
program
  .command('run')
  .description('Run full reel creation pipeline')
  .argument('<prompt>', 'Topic or description for the reel')
  .option('-b, --brand <name>', 'Brand name')
  .option('-s, --style <style>', 'Style/mood (e.g., "minimalist", "luxury", "vintage")')
  .option('-u, --upload <method>', 'Upload method: api | browser | auto', 'auto')
  .option('--no-upload', 'Skip upload, just generate the video file')
  .option('--audio <path>', 'Path to background music file')
  .action(async (prompt: string, options) => {
    await runPipeline(prompt, {
      brandName: options.brand,
      style: options.style,
      upload: !options.noUpload ? (options.upload as UploadMethod) : undefined,
      audioPath: options.audio,
    });
  });

// ── Sub-commands for each step ──
program
  .command('script')
  .description('Generate a reel script from a prompt')
  .argument('<prompt>', 'Topic or description')
  .option('-b, --brand <name>', 'Brand name')
  .option('-s, --style <style>', 'Style/mood')
  .action(async (prompt: string, options) => {
    console.log('Generating script...');
    const script = await generateScript(prompt, {
      brandName: options.brand,
      style: options.style,
    });
    console.log(JSON.stringify(script, null, 2));
  });

program
  .command('images')
  .description('Generate images from a script JSON file')
  .argument('<script-file>', 'Path to script JSON file')
  .action(async (scriptFile: string) => {
    const { default: fs } = await import('fs');
    const script = JSON.parse(fs.readFileSync(scriptFile, 'utf-8'));
    console.log('Generating images...');
    await generateImages(script.scenes);
    console.log('Images saved to output/images/');
  });

program
  .command('video')
  .description('Compile images into a video reel')
  .argument('<images-dir>', 'Directory containing scene images')
  .argument('<script-file>', 'Path to script JSON file')
  .option('--audio <path>', 'Background music file')
  .action(async (imagesDir: string, scriptFile: string, options) => {
    const { default: fs } = await import('fs');
    const { default: path } = await import('path');
    const script = JSON.parse(fs.readFileSync(scriptFile, 'utf-8'));

    const imageFiles = fs.readdirSync(imagesDir)
      .filter((f: string) => f.endsWith('.png'))
      .sort()
      .map((f: string) => ({
        url: path.join(imagesDir, f),
        sceneIndex: parseInt(f.match(/\d+/)?.[0] || '0', 10) - 1,
        altText: '',
      }));

    console.log('Compiling video...');
    let video = await compileReel(imageFiles, script.scenes);

    if (options.audio) {
      console.log('Adding audio track...');
      const withAudio = await addAudio(video.path, options.audio);
      video = { ...video, path: withAudio };
    }

    console.log(`Video saved: ${video.path}`);
    console.log(`Duration: ${video.duration}s, Size: ${(video.size / 1024 / 1024).toFixed(1)}MB`);
  });

program
  .command('upload')
  .description('Upload a video file to Instagram')
  .argument('<video-path>', 'Path to video file')
  .option('-c, --caption <text>', 'Caption text')
  .option('-m, --method <method>', 'Upload method: api | browser | auto', 'auto')
  .action(async (videoPath: string, options) => {
    console.log('Uploading to Instagram...');
    const result = await uploadReel(videoPath, options.caption || '', options.method as UploadMethod);
    if (result.success) {
      console.log('Upload successful!');
    } else {
      console.log('Upload failed.');
    }
  });

// ── Pipeline function ──
async function runPipeline(
  prompt: string,
  opts: {
    brandName?: string;
    style?: string;
    upload?: UploadMethod;
    audioPath?: string;
  }
) {
  const startTime = Date.now();
  const spinner = await import('ora').then((m) => m.default);

  try {
    // Step 1: Generate script
    const step1 = spinner('Generating reel script...').start();
    const script = await generateScript(prompt, {
      brandName: opts.brandName,
      style: opts.style,
    });
    step1.succeed('Script generated');
    console.log(`  Hook: "${script.hook}"`);
    console.log(`  Scenes: ${script.scenes.length}`);
    console.log(`  Hashtags: ${script.hashtags.length}`);

    // Step 2: Generate images (or skip if no provider)
    let images: Awaited<ReturnType<typeof generateImages>> = [];
    if (hasImageProvider()) {
      const step2 = spinner('Generating images with AI...').start();
      images = await generateImages(script.scenes);
      step2.succeed(`${images.length} images generated`);
    } else {
      console.log('  ⚠ No image API key — using text-only video mode');
      console.log('  Set REPLICATE_API_TOKEN or OPENAI_API_KEY in .env for AI images');
    }

    // Step 3: Compile video
    const step3 = spinner('Compiling video reel...').start();
    let video = await compileReel(images, script.scenes);
    step3.succeed('Video compiled');

    // Step 3b: Add audio if provided
    if (opts.audioPath) {
      const stepAudio = spinner('Adding audio track...').start();
      video = await (async () => {
        const result = await addAudio(video.path, opts.audioPath!);
        return { ...video, path: result };
      })();
      stepAudio.succeed('Audio added');
    }

    console.log(`\n📁 Video: ${video.path}`);
    console.log(`⏱  Duration: ${video.duration.toFixed(1)}s`);
    console.log(`💾 Size: ${(video.size / 1024 / 1024).toFixed(1)}MB`);

    // Step 4: Upload
    if (opts.upload) {
      const caption = `${script.captions}\n\n${script.hashtags.join(' ')}`;
      const step4 = spinner('Uploading to Instagram...').start();
      const result = await uploadReel(video.path, caption, opts.upload);
      step4.succeed(result.success ? 'Uploaded to Instagram!' : 'Upload may have issues');
    } else {
      console.log('\n⏭  Upload skipped (--no-upload)');
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Done in ${elapsed}s`);
  } catch (err) {
    console.error('\n❌ Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

program.parse(process.argv);
