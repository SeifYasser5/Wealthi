import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer auto-loads .env or accepts `url` in schema.prisma, so the
// connection URL lives here. `datasource.url` drives both `prisma db push` and
// `prisma migrate`. The application itself creates its own Pool in
// src/db/client.ts.
export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
