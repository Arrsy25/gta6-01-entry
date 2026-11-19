// NEON BAY — entry program for make.fun's gta6-01 bounty (Node 22, stdlib only).
//
// The game lives in game/: plain static files that a desktop browser opens
// offline (game/index.html plus its ES modules and the vendored three.js build;
// nothing is fetched over the network). This program hands the game in: it
// copies game/ and screenshots/ next to this file into the output directory
// and writes dossier.json there with the kit's buildDossier helper, so the
// judge can read the game's sources and screenshots.
//
// Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// (inside the grader the output directory is /output). Serve the game with
// `node serve.ts` and open http://localhost:8080 to play it.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The repository root (this file's directory) and the output directory.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });

// The whole game, exactly as it ships in the repository.
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });

// The screenshots, when they exist. The first by name is the cover image.
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
const shotsDir = join(repoRoot, 'screenshots');
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
}

// The dossier the judge reads, built from what was just copied. The caps
// below mirror the scorer's own limits: at most 4 screenshots of 256 KiB,
// at most 993 files / 48 MiB under game/, paths under 1000 bytes, and the
// dossier text capped at 160 KiB.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
