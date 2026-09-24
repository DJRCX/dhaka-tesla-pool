import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

function loadDotEnvFiles(): void {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
  ];
  for (const path of candidates) {
    try {
      const text = readFileSync(path, 'utf8');
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
    } catch {
      // file optional
    }
  }
}

loadDotEnvFiles();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  TEST_DATABASE_URL: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:43123'),
  FARE_BASE_PAISA: z.coerce.number().int().nonnegative().default(4000),
  FARE_PER_KM_PAISA: z.coerce
    .number()
    .int()
    .positive()
    .refine((n) => n % 10 === 0, 'FARE_PER_KM_PAISA must be divisible by 10')
    .default(2500),
  FARE_POOL_DISCOUNT_PERCENT: z.coerce.number().int().min(0).max(50).default(20),
  POOL_DETOUR_LIMIT_M: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default('info'),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    console.error(`Invalid environment configuration:\n${details}`);
    process.exit(1);
  }
  return parsed.data;
}

export const config = loadConfig();

// Allow `tsx src/config.ts` to verify env loads.
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('config ok', {
    apiPort: config.API_PORT,
    fareBasePaisa: config.FARE_BASE_PAISA,
  });
}
