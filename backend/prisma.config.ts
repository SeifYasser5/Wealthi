import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const { Pool } = pg;

// Prisma 7 no longer auto-loads .env or accepts `url` in schema.prisma, so the
// connection URL lives here. `datasource.url` is required by `prisma db push`;
// the `migrate.adapter` drives `prisma migrate`. The application itself creates
// its own Pool in src/db/client.ts.
export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrate: {
    async adapter(env) {
      const pool = new Pool({ connectionString: env['DATABASE_URL'] });
      return new PrismaPg(pool);
    },
  },
});
