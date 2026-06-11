import { PrismaClient } from "@prisma/client";

// Shared PrismaClient singleton. Stored on globalThis so Next.js dev-mode hot
// reloads reuse the existing client instead of leaking connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
