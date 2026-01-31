const parseOrigins = (...values: (string | undefined)[]) =>
  values
    .flatMap((value) => (value ?? '').split(','))
    .map((v) => v.trim())
    .filter(Boolean)
    .map((origin) => origin.replace(/\/$/, ''));

export function buildAllowedOrigins() {
  const extraOrigins = parseOrigins(
    process.env.CORS_ORIGINS,
    process.env.NEXT_PUBLIC_API_BASE,
    process.env.NEXT_PUBLIC_WEB_ORIGIN,
    process.env.PUBLIC_WEB_ORIGIN,
  );
  const allowedOrigins = new Set([
    'http://localhost:3000',
    'http://localhost:4000',
    'http://localhost:4001',
    ...extraOrigins,
  ]);
  return allowedOrigins;
}

export function isOriginAllowed(origin: string | undefined | null, allowedOrigins: Set<string>) {
  if (!origin) return true; // same-origin or curl
  if (allowedOrigins.has(origin)) return true;
  const allowLocalWildcard =
    /^true$/i.test(process.env.CORS_ALLOW_LOCALHOST_WILDCARD || '') ||
    !/^production$/i.test(process.env.NODE_ENV || '');
  if (!allowLocalWildcard) return false;
  return /^(http:\/\/(localhost|127\.0\.0\.1):\d{2,5})$/i.test(origin);
}

