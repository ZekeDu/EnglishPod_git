import * as fs from 'fs';
import * as path from 'path';

function parseEnvLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const withoutExport = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trim() : trimmed;
  const idx = withoutExport.indexOf('=');
  if (idx <= 0) return null;
  const key = withoutExport.slice(0, idx).trim();
  if (!key) return null;
  let value = withoutExport.slice(idx + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

function applyEnvFile(filePath: string) {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return;
  }
  raw.split(/\r?\n/).forEach((line) => {
    const parsed = parseEnvLine(line);
    if (!parsed) return;
    if (process.env[parsed.key] == null || process.env[parsed.key] === '') {
      process.env[parsed.key] = parsed.value;
    }
  });
}

export function loadEnvFiles() {
  // Keep runtime predictable:
  // - Never overrides explicit env vars.
  // - Only reads from local .env files when DATABASE_URL is missing (common in dev).
  if (process.env.DATABASE_URL) return;

  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, '.env'),
    path.join(cwd, '.env.local'),
    path.join(cwd, '..', '.env'),
    path.join(cwd, '..', '..', '.env'),
    path.join(cwd, '..', '..', '.env.local'),
  ];
  candidates.forEach(applyEnvFile);
}

