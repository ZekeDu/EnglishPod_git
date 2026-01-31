import * as path from 'path';

export function safeJoinPath(baseDir: string, relPath: string) {
  const base = path.resolve(baseDir);
  const rel = String(relPath || '').replace(/\0/g, '').replace(/\\/g, '/');
  const target = path.resolve(base, rel);
  const relative = path.relative(base, target);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
    return target;
  }
  throw new Error('invalid_path');
}

