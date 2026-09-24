import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://teslapool:change-me-locally@localhost:54329/teslapool',
  },
  strict: true,
  verbose: true,
});
