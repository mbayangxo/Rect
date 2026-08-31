import fs from "node:fs";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";

const LOCAL_DB = path.join(/*turbopackIgnore: true*/ process.cwd(), "prisma", "dev.db");
const VERCEL_DB = "/tmp/k-direction.db";

function resolveDatabaseUrl() {
  const configured = process.env.DATABASE_URL ?? `file:${LOCAL_DB}`;
  if (!configured.startsWith("file:")) {
    return configured;
  }

  if (process.env.VERCEL) {
    if (
      fs.existsSync(/*turbopackIgnore: true*/ LOCAL_DB) &&
      !fs.existsSync(/*turbopackIgnore: true*/ VERCEL_DB)
    ) {
      fs.copyFileSync(/*turbopackIgnore: true*/ LOCAL_DB, VERCEL_DB);
    }
    return `file:${VERCEL_DB}`;
  }

  return configured.startsWith("file:") ? configured : `file:${LOCAL_DB}`;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma() {
  if (!globalForPrisma.prisma) {
    const adapter = new PrismaBetterSqlite3({ url: resolveDatabaseUrl() });
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.prisma;
}
