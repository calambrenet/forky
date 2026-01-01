#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Read version from package.json
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const version = packageJson.version;

// Update Cargo.toml
const cargoPath = join(rootDir, 'src-tauri', 'Cargo.toml');
let cargoContent = readFileSync(cargoPath, 'utf8');
cargoContent = cargoContent.replace(/^version = ".*"/m, `version = "${version}"`);
writeFileSync(cargoPath, cargoContent);

console.log(`Synced version ${version} to Cargo.toml`);
