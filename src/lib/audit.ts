import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

type Tx = Prisma.TransactionClient | typeof prisma;

export async function audit(
  tx: Tx,
  args: {
    userId: string;
    projectId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    details?: Prisma.InputJsonValue;
  },
) {
  await tx.auditLog.create({
    data: {
      userId: args.userId,
      projectId: args.projectId ?? null,
      action: args.action,
      entity: args.entity,
      entityId: args.entityId ?? null,
      details: args.details,
    },
  });
}
