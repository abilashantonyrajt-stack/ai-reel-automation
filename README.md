# AI Reel Automation

AI workflow automation for generating and uploading Instagram Reels.

## Pipeline

```
Prompt → AI Script → AI Images → FFmpeg Reel → Instagram Upload
```

## Setup

```bash
npm install
cp .env.example .env
```

Configure `.env` with your API keys:

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Script generation (any OpenAI-compatible API) |
| `OPENAI_BASE_URL` | API endpoint (default: `https://api.openai.com/v1`) |
| `REPLICATE_API_TOKEN` | Image generation via FLUX / Stable Diffusion |
| `META_*` credentials | Instagram API upload (Business account) |

## Usage

```bash
# Full pipeline
npm run dev -- run "luxury pearl necklace" -b "Brand Name" -s "luxury"

# Generate script only
npm run dev -- script "topic description"

# Upload to Instagram (browser mode)
npm install playwright
npx playwright install chromium
npm run dev -- upload video.mp4 -c "caption"
```

## Commands

| Command | Description |
|---|---|
| `run <prompt>` | Full pipeline (script → images → video → upload) |
| `script <prompt>` | Generate reel script only |
| `images <file>` | Generate images from script JSON |
| `video <dir> <file>` | Compile images into video |
| `upload <path>` | Upload video to Instagram |

## Tech Stack

- **Script**: OpenAI-compatible LLM (big-pickle, GPT-4o, etc.)
- **Images**: Replicate (FLUX) / OpenAI DALL-E
- **Video**: FFmpeg
- **Upload**: Meta Graph API / Playwright browser automation
