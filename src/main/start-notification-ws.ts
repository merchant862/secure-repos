import http from 'http';

import { Op } from 'sequelize';
import { WebSocketServer, WebSocket } from 'ws';

import { connectDatabase } from '../bootstrap/database';
import { env } from '../bootstrap/env';
import { InAppNotification } from '../db/models';
import { resolveSession } from '../app/services/auth.service';
import { getUnreadNotificationCount } from '../app/services/in-app-notification.service';

type ClientContext =
{
    userId: number;
    tenantId: number;
    lastNotificationId: number;
};

const authCookieName = process.env.AUTH_COOKIE_NAME && process.env.AUTH_COOKIE_NAME.trim() !== ''
    ? process.env.AUTH_COOKIE_NAME
    : 'security_platform_token';
const clients = new Map<WebSocket, ClientContext>();

function getCookieValue(cookieHeader: string | undefined, name: string): string
{
    if (!cookieHeader) return '';

    for (const cookie of cookieHeader.split(';'))
    {
        const [rawKey, ...rawValue] = cookie.trim().split('=');
        if (rawKey === name) return decodeURIComponent(rawValue.join('='));
    }

    return '';
}

function send(ws: WebSocket, event: string, data: object)
{
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ event, data }));
}

async function authenticateUpgrade(request: http.IncomingMessage)
{
    const token = getCookieValue(request.headers.cookie, authCookieName);
    if (!token) return null;

    return resolveSession(token);
}

async function sendSnapshot(ws: WebSocket, context: ClientContext)
{
    const [unreadCount, latest] = await Promise.all(
        [
            getUnreadNotificationCount(context.tenantId, context.userId),
            InAppNotification.findAll(
                {
                    where:
                    {
                        tenantId: context.tenantId,
                        [Op.or]:
                        [
                            { userId: null },
                            { userId: context.userId }
                        ]
                    },
                    order: [['createdAt', 'DESC']],
                    limit: 5
                }
            )
        ]
    );

    context.lastNotificationId = Math.max(context.lastNotificationId, latest[0]?.id ?? 0);
    send(ws, 'notifications.snapshot', { unreadCount, latest });
}

async function pushNewNotifications()
{
    const byTenant = new Map<number, Array<{ ws: WebSocket; context: ClientContext }>>();

    for (const [ws, context] of clients)
    {
        if (ws.readyState !== WebSocket.OPEN)
        {
            clients.delete(ws);
            continue;
        }

        const list = byTenant.get(context.tenantId) ?? [];
        list.push({ ws, context });
        byTenant.set(context.tenantId, list);
    }

    for (const [tenantId, tenantClients] of byTenant)
    {
        const since = Math.min(...tenantClients.map((item) => item.context.lastNotificationId));
        const notifications = await InAppNotification.findAll(
            {
                where:
                {
                    tenantId,
                    id: { [Op.gt]: since }
                },
                order: [['id', 'ASC']],
                limit: 100
            }
        );

        if (notifications.length === 0) continue;

        for (const { ws, context } of tenantClients)
        {
            const visible = notifications.filter((notification) =>
                notification.id > context.lastNotificationId
                && (notification.userId === null || Number(notification.userId) === context.userId));

            for (const notification of visible)
            {
                send(ws, 'notifications.created', { notification });
                context.lastNotificationId = Math.max(context.lastNotificationId, notification.id);
            }

            const unreadCount = await getUnreadNotificationCount(context.tenantId, context.userId);
            send(ws, 'notifications.count', { unreadCount });
        }
    }
}

async function start()
{
    await connectDatabase();

    const server = http.createServer(function (_req, res)
    {
        res.writeHead(404);
        res.end();
    });
    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', async function (request, socket, head)
    {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;

        if (pathname !== '/ws/notifications')
        {
            socket.destroy();
            return;
        }

        const resolved = await authenticateUpgrade(request).catch(() => null);
        if (!resolved)
        {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }

        wss.handleUpgrade(request, socket, head, function (ws)
        {
            const context: ClientContext =
            {
                userId: resolved.user.id,
                tenantId: resolved.user.tenantId,
                lastNotificationId: 0
            };
            clients.set(ws, context);
            sendSnapshot(ws, context).catch(() => ws.close());
            ws.on('close', () => clients.delete(ws));
            ws.on('pong', () => send(ws, 'heartbeat', { timestamp: new Date().toISOString() }));
        });
    });

    setInterval(function ()
    {
        pushNewNotifications().catch((error) => console.warn('Notification websocket poll failed:', error instanceof Error ? error.message : error));
    }, 2500);

    setInterval(function ()
    {
        for (const ws of clients.keys())
        {
            if (ws.readyState === WebSocket.OPEN) ws.ping();
        }
    }, 25000);

    server.listen(env.notificationWsPort, function ()
    {
        console.log(`${env.appName} notification websocket listening on port ${env.notificationWsPort}`);
    });
}

start().catch(function (error)
{
    console.error('Failed to start notification websocket:', error);
    process.exit(1);
});
