import { AuditLog } from '../../db/models';

async function recordAuditLog(input: {
    tenantId: number;
    userId?: number | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: object | null;
    ipAddress?: string | null;
})
{
    return AuditLog.create(
        {
            tenantId: input.tenantId,
            userId: input.userId ?? null,
            action: input.action,
            entityType: input.entityType,
            entityId: input.entityId ?? null,
            metadata: input.metadata ?? null,
            ipAddress: input.ipAddress ?? null
        }
    );
}

export {
    recordAuditLog
};
