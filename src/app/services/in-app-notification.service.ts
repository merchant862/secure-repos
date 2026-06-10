import { Op } from 'sequelize';

import { InAppNotification, User } from '../../db/models';

async function createTenantNotification(input: {
    tenantId: number;
    type: string;
    title: string;
    body: string;
    payload?: object | null;
})
{
    return InAppNotification.create(
        {
            tenantId: input.tenantId,
            userId: null,
            type: input.type,
            title: input.title,
            body: input.body,
            payload: input.payload ?? null
        }
    );
}

async function getUnreadNotificationCount(tenantId: number, userId: number)
{
    return InAppNotification.count(
        {
            where:
            {
                tenantId,
                readAt: null,
                [Op.or]:
                [
                    { userId: null },
                    { userId }
                ]
            }
        }
    );
}

async function markNotificationRead(notificationId: number, user: User)
{
    const notification = await InAppNotification.findOne(
        {
            where:
            {
                id: notificationId,
                tenantId: user.tenantId
            }
        }
    );

    if (!notification)
    {
        return null;
    }

    await notification.update({ readAt: new Date() });
    return notification;
}

export {
    createTenantNotification,
    getUnreadNotificationCount,
    markNotificationRead
};
