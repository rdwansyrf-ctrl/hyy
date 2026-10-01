import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient | null {
  if (process.env.DATABASE_URL && !prisma) {
    try {
      prisma = new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
      });
    } catch {
      // Graceful fallback to memory store if PostgreSQL client cannot be initialized
      prisma = null;
    }
  }
  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
