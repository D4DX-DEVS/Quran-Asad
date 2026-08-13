// Every environment variable the backend reads, in one place.
//
// Importing this loads .env and validates what it finds, so a misconfigured
// deployment fails at startup with a clear message rather than part-way through
// the first request. Nothing else in the project should touch process.env.

import 'dotenv/config';

const missing = [];

const required = (name) => {
  const value = process.env[name];
  if (!value) missing.push(name);
  return value;
};

const optional = (name, fallback) => process.env[name] ?? fallback;

const number = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    missing.push(`${name} (expected a number, got "${raw}")`);
    return fallback;
  }
  return value;
};

const list = (name) => {
  const raw = process.env[name];
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
};

export const config = {
  // The port the API listens on. Hosts usually inject this.
  port: number('PORT', 3000),

  mongo: {
    uri: required('MONGODB_URI'),
    // Undefined falls back to the database named in the connection string.
    dbName: optional('MONGODB_DB', undefined),
  },

  // Number of proxy hops in front of the app. Without it the rate limiter sees
  // the proxy's address on every request and treats all traffic as one client,
  // so set it to 1 behind a single load balancer or CDN.
  trustProxy: number('TRUST_PROXY', 0),

  rateLimit: {
    windowMs: number('RATE_LIMIT_WINDOW_MS', 60_000),
    max: number('RATE_LIMIT_MAX', 300),
  },

  // `mongodb+srv://` needs an SRV lookup, and some home and ISP resolvers
  // refuse it outright. Leave unset in production.
  dnsServers: list('DNS_SERVERS'),

  // Only the one-off scripts use these.
  dataDir: optional('DATA_DIR', 'data'),

  spaces: {
    key: optional('DO_SPACES_KEY'),
    secret: optional('DO_SPACES_SECRET'),
    endpoint: optional('DO_SPACES_ENDPOINT'),
    cdnEndpoint: optional('DO_SPACES_CDN_ENDPOINT'),
    bucket: optional('DO_SPACES_BUCKET'),
    folder: optional('DO_SPACES_FOLDER', ''),
  },
};

/// Throws when anything the server cannot run without is absent. Called by the
/// server at startup; scripts that need extra variables check them themselves.
export const assertServerConfig = () => {
  if (missing.length > 0) {
    throw new Error(
      `Missing or invalid environment variables: ${missing.join(', ')}. ` +
        'Copy .env.example to .env and fill it in.',
    );
  }
};

/// The subset the image upload script needs, validated on demand so the server
/// does not require DigitalOcean credentials just to serve content.
export const assertSpacesConfig = () => {
  const absent = ['key', 'secret', 'endpoint', 'bucket'].filter((k) => !config.spaces[k]);
  if (absent.length > 0) {
    throw new Error(
      `Missing DigitalOcean Spaces settings: ${absent.map((k) => `DO_SPACES_${k.toUpperCase()}`).join(', ')}.`,
    );
  }
};
