import { z } from 'zod';
import { UnifiedTool } from './registry.js';
import { runWithBackend, withNotices } from '../backends/index.js';
import { existsSync, copyFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import path from 'path';
import os from 'os';

const AGY_BASE = path.join(os.homedir(), '.gemini', 'antigravity-cli');
const BRAIN_DIR = path.join(AGY_BASE, 'brain');

const geminiImageArgsSchema = z.object({
  prompt: z.string().min(1).describe("Detailed visual description of the image to create (subject, environment, lighting, artistic style, colors)."),
  aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3']).default('1:1').describe("Aspect ratio of the generated image (default: '1:1')."),
  outputPath: z.string().optional().describe("Optional relative file path in your project workspace where the generated image file should be copied (e.g., 'assets/hero.jpg')."),
});

/** Find recently created image files in agy brain conversation directories. */
function findLatestImageFile(sinceMs: number): string | undefined {
  if (!existsSync(BRAIN_DIR)) return undefined;
  try {
    const convDirs = readdirSync(BRAIN_DIR);
    let bestFile: string | undefined;
    let bestTime = sinceMs;

    for (const convId of convDirs) {
      const convPath = path.join(BRAIN_DIR, convId);
      try {
        const stat = statSync(convPath);
        if (!stat.isDirectory() || stat.mtimeMs < sinceMs - 30_000) continue;

        const files = readdirSync(convPath);
        for (const file of files) {
          if (/\.(jpe?g|png|webp)$/i.test(file)) {
            const filePath = path.join(convPath, file);
            const fileStat = statSync(filePath);
            if (fileStat.mtimeMs > bestTime) {
              bestTime = fileStat.mtimeMs;
              bestFile = filePath;
            }
          }
        }
      } catch {
        // Skip unreadable directories
      }
    }
    return bestFile;
  } catch {
    return undefined;
  }
}

/** Extract image file paths from agy markdown response text. */
function extractImagePathFromText(text: string): string | undefined {
  const mdMatch = text.match(/!\[.*?\]\(([^)]+\.(?:jpe?g|png|webp))\)/i);
  if (mdMatch && mdMatch[1]) {
    let raw = mdMatch[1].replace(/^file:\/\/\//i, '');
    if (process.platform === 'win32') {
      raw = raw.replace(/^\/([a-zA-Z]:)/, '$1');
    }
    if (existsSync(raw)) return raw;
  }

  const directMatch = text.match(/([a-zA-Z]:[\\/][^"')\s\r\n]+\.(?:jpe?g|png|webp))/i);
  if (directMatch && directMatch[1] && existsSync(directMatch[1])) {
    return directMatch[1];
  }

  return undefined;
}

export const geminiImageTool: UnifiedTool = {
  name: "gemini-image",
  description: "Generate images using Google Gemini & Imagen directly from text descriptions. Supports aspect ratio selection and optional export directly into your project workspace.",
  zodSchema: geminiImageArgsSchema,
  prompt: {
    description: "Generate an image from a prompt with optional aspect ratio and local file output.",
  },
  category: 'gemini',
  execute: async (args, onProgress) => {
    const { prompt, aspectRatio = '1:1', outputPath } = args;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      throw new Error("Please provide a prompt describing the image you want to generate.");
    }

    const startMs = Date.now();
    const generationPrompt = `Please generate an image based on the following creative specifications:
- Prompt: ${prompt.trim()}
- Aspect Ratio: ${aspectRatio}

Use your image generation tool to produce the asset.`;

    onProgress?.(`🎨 Generating image with aspect ratio ${aspectRatio}...`);

    const { text, notices, backend } = await runWithBackend(generationPrompt, {
      model: "gemini-3.8-flash-high",
      onProgress,
    });

    // Locate the generated image file
    let imagePath = extractImagePathFromText(text) || findLatestImageFile(startMs);
    let destinationNotice = "";

    if (typeof outputPath === 'string' && outputPath.trim() && imagePath && existsSync(imagePath)) {
      const cwd = process.cwd();
      const outPathStr = outputPath.trim();
      const resolvedTarget = path.resolve(cwd, outPathStr);

      // Security check: ensure target does not escape project workspace root
      const relative = path.relative(cwd, resolvedTarget);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Invalid outputPath: "${outPathStr}" escapes the project workspace directory.`);
      }

      mkdirSync(path.dirname(resolvedTarget), { recursive: true });
      copyFileSync(imagePath, resolvedTarget);
      destinationNotice = `\n\n💾 **Saved to Project:** \`${relative.replace(/\\/g, '/')}\``;
      imagePath = resolvedTarget;
    }

    const imageEmbed = imagePath && existsSync(imagePath)
      ? `\n\n![Generated Image](file:///${imagePath.replace(/\\/g, '/')})\n*File: \`${imagePath}\`*`
      : "";

    const responseText = `### 🎨 Gemini Image Generation Completed

- **Prompt:** "${prompt.trim()}"
- **Aspect Ratio:** \`${aspectRatio}\`
- **Backend:** \`${backend.toUpperCase()}\`${destinationNotice}${imageEmbed}

${text}`;

    return withNotices(notices, responseText);
  },
};
