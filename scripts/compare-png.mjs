#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { comparePngBuffers, encodeRgbaPng } from './lib/png-diff.mjs';

function usage() {
  return `Usage: pnpm visual:diff -- <reference.png> <implementation.png> [options]

Options:
  --pixel-threshold <0..1>   Ignore per-channel noise at or below this normalized delta (default: 0)
  --max-diff-ratio <0..1>    Maximum accepted ratio of changed pixels (default: 0)
  --diff <path.png>          Write a magenta diff image
`;
}

function parseRatio(label, value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw new Error(`${label} must be a number between 0 and 1.`);
  }
  return number;
}

function parseArgs(argv) {
  const positional = [];
  const options = { pixelThreshold: 0, maxDiffRatio: 0, diffPath: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    } else if (arg === '--pixel-threshold') {
      options.pixelThreshold = parseRatio(arg, argv[++index]);
    } else if (arg === '--max-diff-ratio') {
      options.maxDiffRatio = parseRatio(arg, argv[++index]);
    } else if (arg === '--diff') {
      options.diffPath = argv[++index];
      if (!options.diffPath) throw new Error('--diff requires an output path.');
    } else if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage());
      process.exit(0);
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length !== 2) throw new Error('Expected a reference PNG and an implementation PNG.');
  return { referencePath: positional[0], implementationPath: positional[1], ...options };
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const [reference, implementation] = await Promise.all([
      readFile(options.referencePath),
      readFile(options.implementationPath),
    ]);
    const result = await comparePngBuffers(reference, implementation, {
      pixelThreshold: options.pixelThreshold,
    });
    if (options.diffPath) {
      await writeFile(
        options.diffPath,
        await encodeRgbaPng(result.width, result.height, result.diffRgba),
      );
    }

    const passed = result.diffRatio <= options.maxDiffRatio;
    process.stdout.write(`${JSON.stringify({
      passed,
      reference: options.referencePath,
      implementation: options.implementationPath,
      width: result.width,
      height: result.height,
      pixelThreshold: options.pixelThreshold,
      maxDiffRatio: options.maxDiffRatio,
      differentPixels: result.differentPixels,
      pixelCount: result.pixelCount,
      diffRatio: result.diffRatio,
      meanAbsoluteError: result.meanAbsoluteError,
      maxChannelDelta: result.maxChannelDelta,
      diffPath: options.diffPath,
    }, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}`);
    process.exitCode = 2;
  }
}

await main();
