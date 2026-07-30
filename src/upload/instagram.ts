import fs from 'fs';
import type { UploadMethod } from '../types.js';

interface UploadResult {
  success: boolean;
  mediaId?: string;
  permalink?: string;
  method: UploadMethod;
}

// ── Meta Graph API Upload (requires Instagram Business/Creator account) ──

async function uploadViaApi(videoPath: string, caption: string): Promise<UploadResult> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const businessId = process.env.INSTAGRAM_BUSINESS_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!appId || !appSecret || !businessId || !accessToken) {
    throw new Error(
      'Missing Meta API credentials. Set META_APP_ID, META_APP_SECRET, ' +
      'INSTAGRAM_BUSINESS_ID, and META_ACCESS_TOKEN in .env'
    );
  }

  const apiVersion = 'v21.0';
  const baseUrl = `https://graph.facebook.com/${apiVersion}`;

  // Step 1: Create media container
  const videoSize = fs.statSync(videoPath).size;
  const isLarge = videoSize > 50 * 1024 * 1024; // > 50MB needs chunked upload

  let creationUrl: string;
  let creationParams: Record<string, string>;

  if (isLarge) {
    // Start segmented upload
    const startRes = await fetch(
      `${baseUrl}/${businessId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'VIDEO',
          video_url: '', // will be set after upload
          caption,
          access_token: accessToken,
          upload_type: 'resumable',
        }),
      }
    );
    const startData = await startRes.json();

    if (!startRes.ok) {
      throw new Error(`Instagram API error (create container): ${JSON.stringify(startData)}`);
    }

    creationUrl = `${baseUrl}/${startData.id}`;
    creationParams = {};
  } else {
    // Simple upload for smaller files
    const formData = new FormData();
    const videoBlob = new Blob([fs.readFileSync(videoPath)], { type: 'video/mp4' });
    formData.append('media_type', 'VIDEO');
    formData.append('video', videoBlob, 'reel.mp4');
    formData.append('caption', caption);
    formData.append('access_token', accessToken);

    const res = await fetch(
      `${baseUrl}/${businessId}/media`,
      { method: 'POST', body: formData }
    );
    const data = await res.json();

    if (!res.ok) {
      throw new Error(`Instagram API error (upload): ${JSON.stringify(data)}`);
    }

    creationUrl = `${baseUrl}/${data.id}`;
    creationParams = {};
  }

  // Step 2: Poll until media is ready
  const containerId = creationUrl.split('/').pop();
  if (!containerId) throw new Error('No container ID returned');

  let status = 'IN_PROGRESS';
  let attempts = 0;
  const maxAttempts = 30;

  while (status === 'IN_PROGRESS' && attempts < maxAttempts) {
    await new Promise((r) => setTimeout(r, 3000));
    attempts++;

    const statusRes = await fetch(
      `${baseUrl}/${containerId}?fields=status_code&access_token=${accessToken}`
    );
    const statusData = await statusRes.json();
    status = statusData.status_code || 'ERROR';

    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new Error(`Media processing failed: ${JSON.stringify(statusData)}`);
    }
  }

  // Step 3: Publish
  const publishRes = await fetch(
    `${baseUrl}/${businessId}/media_publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: accessToken,
      }),
    }
  );
  const publishData = await publishRes.json();

  if (!publishRes.ok) {
    throw new Error(`Instagram API error (publish): ${JSON.stringify(publishData)}`);
  }

  return {
    success: true,
    mediaId: publishData.id,
    method: 'api',
  };
}

// ── Playwright Browser Upload (works with personal accounts) ──

async function uploadViaBrowser(videoPath: string, caption: string): Promise<UploadResult> {
  console.log('Opening Instagram in browser...');

  let chromium: any;
  try {
    chromium = (await import('playwright')).chromium;
  } catch {
    throw new Error(
      'Playwright is not installed. Run: npm install playwright && npx playwright install chromium'
    );
  }
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    storageState: undefined,
  });
  const page = await context.newPage();

  try {
    // Navigate to Instagram
    await page.goto('https://www.instagram.com', { waitUntil: 'networkidle' });

    // Check if already logged in
    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('accounts/login')) {
      console.log('Instagram login required.');
      console.log('Please log in in the browser window, then press Enter here...');

      // Wait for navigation away from login page
      await page.waitForURL('https://www.instagram.com/', { timeout: 120000 });
      console.log('Login detected! Proceeding...');
    }

    // Click create button (+ icon)
    const createButton = page.getByLabel('Create', { exact: true });
    await createButton.waitFor({ timeout: 10000 });
    await createButton.click();
    await page.waitForTimeout(1000);

    // Select "Reel" option
    const reelOption = page.getByText('Reel').first();
    await reelOption.click();
    await page.waitForTimeout(1000);

    // Upload video file
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(videoPath);
    await page.waitForTimeout(3000);

    // Click Next / Arrow button to go to edit screen
    const nextButton = page.getByLabel('Next').or(page.getByText('Next'));
    await nextButton.click();
    await page.waitForTimeout(2000);

    // Add caption
    const captionInput = page.locator('[aria-label="Write a caption..."]').first();
    await captionInput.fill(caption);
    await page.waitForTimeout(500);

    // Click Share button
    const shareButton = page.getByText('Share').first();
    await shareButton.click();

    // Wait for upload to complete
    console.log('Reel uploading... This may take a moment.');
    await page.waitForTimeout(15000);

    console.log('Upload completed!');
    return { success: true, method: 'browser' };
  } catch (err) {
    console.error('Browser upload error:', err);
    const screenshotPath = 'output/upload-error.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  Screenshot saved to ${screenshotPath}`);
    return { success: false, method: 'browser' };
  } finally {
    await browser.close();
  }
}

// ── Main Upload Function ──

export async function uploadReel(
  videoPath: string,
  caption: string,
  method: UploadMethod = 'auto'
): Promise<UploadResult> {
  const hasApiCreds = !!(process.env.META_APP_ID && process.env.META_ACCESS_TOKEN);

  if (method === 'api' && !hasApiCreds) {
    throw new Error('Meta API credentials not configured. Use browser method or set up .env');
  }

  if (method === 'api' || (method === 'auto' && hasApiCreds)) {
    console.log('Uploading via Meta Graph API...');
    return uploadViaApi(videoPath, caption);
  }

  if (method === 'browser' || (method === 'auto' && !hasApiCreds)) {
    console.log('Uploading via browser automation...');
    return uploadViaBrowser(videoPath, caption);
  }

  throw new Error(`Unknown upload method: ${method}`);
}
