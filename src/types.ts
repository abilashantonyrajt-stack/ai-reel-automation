export interface ReelConfig {
  prompt: string;
  brandName?: string;
  style?: string;
  duration?: number;
  width?: number;
  height?: number;
  voiceover?: boolean;
  musicTrack?: string;
}

export interface ReelScript {
  hook: string;
  scenes: Scene[];
  callToAction: string;
  captions: string;
  hashtags: string[];
}

export interface Scene {
  description: string;
  imagePrompt: string;
  textOverlay?: string;
  duration: number;
}

export interface GeneratedImage {
  url: string;
  sceneIndex: number;
  altText: string;
}

export interface VideoOutput {
  path: string;
  duration: number;
  size: number;
}

export type UploadMethod = 'api' | 'browser' | 'auto';
