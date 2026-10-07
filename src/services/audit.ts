import * as T from '../db/schema';

export async function audit(
  db: any,
  input: {
    organizationId: string;
    userId: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: unknown;
  },
) {
  await db.insert(T.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: input.organizationId,
    userId: input.userId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
  });
}
