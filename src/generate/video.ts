import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import fs from 'fs';
import path from 'path';
import type { Scene, GeneratedImage, VideoOutput } from '../types.js';

ffmpeg.setFfmpegPath(ffmpegPath.path);

const OUTPUT_DIR = path.resolve('output/videos');

function getDimensions(): { w: number; h: number } {
  return {
    w: parseInt(process.env.REEL_WIDTH || '1080', 10),
    h: parseInt(process.env.REEL_HEIGHT || '1920', 10),
  };
}

function escapeDrawText(text: string): string {
  return text
    .replace(/'/g, "'\\\\\\''")
    .replace(/:/g, '\\:')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

const COLORS = [
  '#1a0a0a', '#0d1b1b', '#1a0d14', '#0f111a', '#1a120b',
  '#0d0d1a', '#1a1410', '#100b1a', '#1a0f0f', '#0f1a14',
];

export async function compileReel(
  images: GeneratedImage[],
  scenes: Scene[]
): Promise<VideoOutput> {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const { w, h } = getDimensions();
  const timestamp = Date.now();
  const outputPath = path.join(OUTPUT_DIR, `reel-${timestamp}.mp4`);
  const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);

  const useImages = images.length > 0 && images.some((img) => fs.existsSync(img.url));
  const n = useImages ? Math.min(images.length, scenes.length) : scenes.length;

  return new Promise((resolve, reject) => {
    const command = ffmpeg();

    if (useImages) {
      // Image-based mode
      for (let i = 0; i < n; i++) {
        const img = images[i];
        const scene = scenes[img.sceneIndex] || scenes[Math.min(i, scenes.length - 1)];
        command.input(img.url).inputOptions([`-loop 1`, `-t ${scene.duration}`]);
      }

      const filterParts: string[] = [];
      let cumulativeTime = 0;

      for (let i = 0; i < n; i++) {
        filterParts.push(
          `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,` +
          `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black[v${i}]`
        );
      }

      const concatInputs = Array.from({ length: n }, (_, i) => `[v${i}]`).join('');
      filterParts.push(`${concatInputs}concat=n=${n}:v=1:a=0[vid]`);

      // Add text overlays
      let time = 0;
      for (let i = 0; i < n; i++) {
        const scene = scenes[Math.min(i, scenes.length - 1)];
        if (scene.textOverlay) {
          const escaped = escapeDrawText(scene.textOverlay);
          filterParts.push(
            `[vid]drawtext=text='${escaped}':` +
            `fontsize=48:fontcolor=white:shadowcolor=black@0.8:shadowx=3:shadowy=3:` +
            `x=(w-text_w)/2:y=h*0.85:` +
            `enable='between(t,${time},${time + scene.duration})'[vid]`
          );
        }
        time += scene.duration;
      }

      command
        .complexFilter(filterParts)
        .outputOptions([
          '-map [vid]',
          '-c:v libx264', '-preset fast', '-crf 23',
          '-pix_fmt yuv420p', '-movflags +faststart', '-r 30',
        ]);
    } else {
      // Text-only fallback mode
      const filterParts: string[] = [];

      for (let i = 0; i < n; i++) {
        const scene = scenes[i];
        const dur = scene.duration;
        const color = COLORS[i % COLORS.length];
        const text = escapeDrawText(scene.textOverlay || scene.description);

        filterParts.push(
          `color=c=${color}:s=${w}x${h}:d=${dur}[bg${i}]`
        );
        filterParts.push(
          `[bg${i}]drawtext=text='${text}':fontsize=48:fontcolor=white:` +
          `shadowcolor=black@0.6:shadowx=3:shadowy=3:` +
          `x=(w-text_w)/2:y=(h-text_h)/2[v${i}]`
        );
      }

      const concatInputs = Array.from({ length: n }, (_, i) => `[v${i}]`).join('');
      filterParts.push(`${concatInputs}concat=n=${n}:v=1:a=0[vid]`);

      command
        .complexFilter(filterParts)
        .outputOptions([
          '-map [vid]',
          '-c:v libx264', '-preset fast', '-crf 25',
          '-pix_fmt yuv420p', '-movflags +faststart', '-r 30',
        ]);
    }

    command
      .output(outputPath)
      .on('end', () => {
        const stats = fs.statSync(outputPath);
        resolve({ path: outputPath, duration: totalDuration, size: stats.size });
      })
      .on('error', (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
      .run();
  });
}

export async function addAudio(videoPath: string, audioPath: string): Promise<string> {
  const parsed = path.parse(videoPath);
  const outputPath = path.join(parsed.dir, `${parsed.name}-with-audio${parsed.ext}`);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions(['-shortest', '-c:v copy', '-c:a aac', '-b:a 192k', '-af volume=0.3'])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(new Error(`FFmpeg audio error: ${err.message}`)))
      .run();
  });
}
