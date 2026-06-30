import crypto from 'crypto';
import { Op } from 'sequelize';

import { env } from '../../bootstrap/env';
import { PricingPlan, TenantSubscription, User } from '../../db/models';
import { queueEmailEvent } from './notification.service';

type CheckoutConfigInput = {
    planSlug: string;
    tenantId?: number;
    userId?: number;
    email?: string;
    name?: string;
};

type PaddleWebhookPayload = {
    id?: string;
    event_id?: string;
    eventId?: string;
    event_type?: string;
    eventType?: string;
    occurred_at?: string;
    occurredAt?: string;
    data?: Record<string, unknown>;
};

type PaddleClientEventPayload = Record<string, unknown>;

type PaddlePaymentMethodSummary = {
    id: string | null;
    type: string | null;
    brand: string | null;
    last4: string | null;
    expiryMonth: string | null;
    expiryYear: string | null;
};

const paddlePriceByPlanSlug: Record<string, () => string> =
{
    'solo-starter': () => env.paddleSoloStarterPriceId,
    starter: () => env.paddleSoloStarterPriceId,
    'solo-pro': () => env.paddleSoloProPriceId,
    pro: () => env.paddleSoloProPriceId
};

function normalizePlanSlug(planSlug: string)
{
    return planSlug.trim().toLowerCase();
}

function getPaddlePriceId(planSlug: string)
{
    const resolver = paddlePriceByPlanSlug[normalizePlanSlug(planSlug)];
    return resolver ? resolver() : '';
}

function getCheckoutTokenSecret()
{
    const secret = env.tokenEncryptionKey || env.paddleWebhookSecret;

    if (!secret)
    {
        throw new Error('TOKEN_ENCRYPTION_KEY or PADDLE_WEBHOOK_SECRET is required for checkout token signing');
    }

    return secret;
}

function hashCheckoutPlan(planSlug: string)
{
    return crypto
        .createHmac('sha256', getCheckoutTokenSecret())
        .update(`checkout:v1:${normalizePlanSlug(planSlug)}`)
        .digest('base64url');
}

function createCheckoutToken(planSlug: string)
{
    return `v1.${hashCheckoutPlan(planSlug)}`;
}

function signCheckoutCustomData(input: { tenantId?: number; userId?: number; pricingPlanId: number; planSlug: string })
{
    return crypto
        .createHmac('sha256', getCheckoutTokenSecret())
        .update([
            'paddle-checkout:v1',
            input.tenantId ?? '',
            input.userId ?? '',
            input.pricingPlanId,
            normalizePlanSlug(input.planSlug)
        ].join(':'))
        .digest('base64url');
}

function safeTokenEqual(left: string, right: string)
{
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function verifyCheckoutToken(token: string)
{
    if (!token.startsWith('v1.'))
    {
        throw new Error('Invalid checkout token');
    }

    const plans = await PricingPlan.findAll({ where: { isActive: true }, attributes: ['slug'] });

    for (const plan of plans)
    {
        const expectedToken = createCheckoutToken(plan.slug);

        if (safeTokenEqual(token, expectedToken))
        {
            return normalizePlanSlug(plan.slug);
        }
    }

    throw new Error('Invalid checkout token');
}

function getAppUrl()
{
    return env.appUrl.replace(/\/$/, '');
}

function getPaddleEnvironment()
{
    return env.paddleEnvironment === 'production' ? 'production' : 'sandbox';
}

function getPaddleApiBaseUrl()
{
    return getPaddleEnvironment() === 'production'
        ? 'https://api.paddle.com'
        : 'https://sandbox-api.paddle.com';
}

async function paddleApiRequest<T>(pathName: string, options: { method?: string; body?: object } = {}): Promise<T>
{
    if (!env.paddleApiKey)
    {
        throw new Error('PADDLE_API_KEY is required for Paddle subscription management');
    }

    const response = await fetch(`${getPaddleApiBaseUrl()}${pathName}`,
        {
            method: options.method ?? 'GET',
            headers:
            {
                Authorization: `Bearer ${env.paddleApiKey}`,
                'Content-Type': 'application/json'
            },
            body: options.body ? JSON.stringify(options.body) : undefined
        });
    const raw = await response.text();
    const payload = raw ? JSON.parse(raw) as T : {} as T;

    if (!response.ok)
    {
        const message = typeof payload === 'object' && payload && 'error' in payload
            ? JSON.stringify((payload as { error?: unknown }).error)
            : raw;

        throw new Error(`Paddle API request failed (${response.status}): ${message || response.statusText}`);
    }

    return payload;
}

async function cancelPaddleSubscription(subscriptionId: string, effectiveFrom: 'next_billing_period' | 'immediately' = 'next_billing_period')
{
    return paddleApiRequest(
        `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
        {
            method: 'POST',
            body:
            {
                effective_from: effectiveFrom
            }
        }
    );
}

async function updatePaddleSubscriptionPlan(subscriptionId: string, priceId: string, billingMode: 'prorated_immediately' | 'prorated_next_billing_period')
{
    return paddleApiRequest(
        `/subscriptions/${encodeURIComponent(subscriptionId)}`,
        {
            method: 'PATCH',
            body:
            {
                items:
                [
                    {
                        price_id: priceId,
                        quantity: 1
                    }
                ],
                proration_billing_mode: billingMode
            }
        }
    );
}

async function fetchPaddleTransaction(transactionId: string)
{
    const response = await paddleApiRequest<{ data?: Record<string, unknown> }>(`/transactions/${encodeURIComponent(transactionId)}`);
    return getObject(response.data);
}

async function fetchPaddleSubscription(subscriptionId: string)
{
    const response = await paddleApiRequest<{ data?: Record<string, unknown> }>(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
    return getObject(response.data);
}

async function findPaddleCustomersByEmail(email: string)
{
    const response = await paddleApiRequest<{ data?: Array<Record<string, unknown>> }>(`/customers?email=${encodeURIComponent(email)}`);
    return Array.isArray(response.data) ? response.data : [];
}

async function findPaddleSubscriptionsByCustomer(customerId: string)
{
    const response = await paddleApiRequest<{ data?: Array<Record<string, unknown>> }>(`/subscriptions?customer_id=${encodeURIComponent(customerId)}`);
    return Array.isArray(response.data) ? response.data : [];
}

async function fetchPaddleCustomerPaymentMethods(customerId: string)
{
    const response = await paddleApiRequest<{ data?: Array<Record<string, unknown>> }>(`/customers/${encodeURIComponent(customerId)}/payment-methods`);
    return Array.isArray(response.data) ? response.data : [];
}

function summarizePaddlePaymentMethod(value: Record<string, unknown>): PaddlePaymentMethodSummary
{
    const card = getObject(value.card);
    const paymentMethod = getObject(value.payment_method ?? value.paymentMethod);
    const nestedCard = getObject(paymentMethod.card);
    const source = Object.keys(card).length ? card : Object.keys(nestedCard).length ? nestedCard : value;

    return {
        id: getString(value.id),
        type: getString(value.type ?? paymentMethod.type),
        brand: getString(source.brand ?? source.card_type ?? source.cardType ?? source.scheme),
        last4: getString(source.last4 ?? source.last_four ?? source.lastFour),
        expiryMonth: getString(source.expiry_month ?? source.expiryMonth ?? source.exp_month ?? source.expMonth),
        expiryYear: getString(source.expiry_year ?? source.expiryYear ?? source.exp_year ?? source.expYear)
    };
}

async function getPaddleCustomerPaymentMethodSummary(customerId: string)
{
    const paymentMethods = await fetchPaddleCustomerPaymentMethods(customerId);
    const preferred = paymentMethods.find((method) => Boolean(method.is_default ?? method.isDefault)) ?? paymentMethods[0];

    return preferred ? summarizePaddlePaymentMethod(preferred) : null;
}

function findUrlByKeys(value: unknown, keys: string[], depth = 0): string | null
{
    if (depth > 5 || !value || typeof value !== 'object')
    {
        return null;
    }

    if (Array.isArray(value))
    {
        for (const item of value)
        {
            const found = findUrlByKeys(item, keys, depth + 1);
            if (found) return found;
        }

        return null;
    }

    const objectValue = value as Record<string, unknown>;

    for (const key of keys)
    {
        const direct = getString(objectValue[key]);
        if (direct && /^https?:\/\//i.test(direct)) return direct;
    }

    for (const nested of Object.values(objectValue))
    {
        const found = findUrlByKeys(nested, keys, depth + 1);
        if (found) return found;
    }

    return null;
}

async function createPaddlePaymentMethodUpdateUrl(subscriptionId: string)
{
    const response = await paddleApiRequest<{ data?: Record<string, unknown> }>(`/subscriptions/${encodeURIComponent(subscriptionId)}/update-payment-method-transaction`);
    const data = getObject(response.data);
    const url = findUrlByKeys(
        data,
        [
            'url',
            'checkout_url',
            'checkoutUrl',
            'payment_method_update_url',
            'paymentMethodUpdateUrl'
        ]
    );

    if (!url)
    {
        throw new Error('Paddle did not return a payment method update link');
    }

    return {
        url,
        transactionId: getString(data.id)
    };
}

async function getCheckoutConfig(input: CheckoutConfigInput)
{
    const planSlug = normalizePlanSlug(input.planSlug);
    const plan = await PricingPlan.findOne({ where: { slug: planSlug, isActive: true } });
    const priceId = getPaddlePriceId(planSlug);

    if (!plan)
    {
        throw new Error('Selected plan is not available');
    }

    if (!env.paddleClientToken)
    {
        throw new Error('Paddle client token is not configured');
    }

    if (!priceId)
    {
        throw new Error(`Paddle price id is not configured for ${plan.name}`);
    }

    return {
        environment: getPaddleEnvironment(),
        clientToken: env.paddleClientToken,
        priceId,
        successUrl: `${getAppUrl()}/onboarding?checkout=success`,
        cancelUrl: `${getAppUrl()}/checkout?t=${encodeURIComponent(createCheckoutToken(plan.slug))}&checkout=cancelled`,
        plan:
        {
            id: plan.id,
            slug: plan.slug,
            name: plan.name,
            currency: plan.currency,
            priceMonthlyCents: plan.priceMonthlyCents
        },
        customer: input.email
            ? {
                email: input.email,
                name: input.name || undefined
            }
            : null,
        customData:
        {
            tenantId: input.tenantId,
            userId: input.userId,
            pricingPlanId: plan.id,
            planSlug: plan.slug,
            source: 'securerepos_checkout',
            checkoutSignature: signCheckoutCustomData(
                {
                    tenantId: input.tenantId,
                    userId: input.userId,
                    pricingPlanId: plan.id,
                    planSlug: plan.slug
                }
            )
        }
    };
}

function parsePaddleSignature(header: string)
{
    return header.split(';').reduce<Record<string, string>>(function (parts, segment)
    {
        const [key, ...value] = segment.trim().split('=');

        if (key && value.length > 0)
        {
            parts[key] = value.join('=');
        }

        return parts;
    }, {});
}

function verifyPaddleWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined)
{
    if (!env.paddleWebhookSecret)
    {
        return env.nodeEnv !== 'production';
    }

    if (!signatureHeader)
    {
        return false;
    }

    const parsed = parsePaddleSignature(signatureHeader);
    const timestamp = parsed.ts;
    const signature = parsed.h1;

    if (!timestamp || !signature)
    {
        return false;
    }

    const timestampMs = Number(timestamp) * 1000;
    const fiveMinutesMs = 5 * 60 * 1000;

    if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > fiveMinutesMs)
    {
        return false;
    }

    const signedPayload = `${timestamp}:${rawBody.toString('utf8')}`;
    const expected = crypto.createHmac('sha256', env.paddleWebhookSecret).update(signedPayload).digest('hex');
    const received = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');

    if (received.length !== expectedBuffer.length)
    {
        return false;
    }

    return crypto.timingSafeEqual(received, expectedBuffer);
}

function getObject(value: unknown): Record<string, unknown>
{
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getString(value: unknown)
{
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function getNumber(value: unknown)
{
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
}

function requireValidCheckoutCustomData(customData: Record<string, unknown>)
{
    const tenantId = getNumber(customData.tenantId ?? customData.tenant_id);
    const userId = getNumber(customData.userId ?? customData.user_id);
    const pricingPlanId = getNumber(customData.pricingPlanId ?? customData.pricing_plan_id);
    const planSlug = getString(customData.planSlug ?? customData.plan_slug);
    const signature = getString(customData.checkoutSignature ?? customData.checkout_signature);

    if (!tenantId)
    {
        return;
    }

    if (!userId || !pricingPlanId || !planSlug || !signature)
    {
        throw new Error('Paddle checkout metadata is incomplete');
    }

    const expectedSignature = signCheckoutCustomData({ tenantId, userId, pricingPlanId, planSlug });

    if (!safeTokenEqual(signature, expectedSignature))
    {
        throw new Error('Paddle checkout metadata signature is invalid');
    }
}

function getDate(value: unknown)
{
    const stringValue = getString(value);

    if (!stringValue)
    {
        return null;
    }

    const date = new Date(stringValue);
    return Number.isNaN(date.getTime()) ? null : date;
}

function findStringByKeys(value: unknown, keys: string[], depth = 0): string | null
{
    if (depth > 5 || !value || typeof value !== 'object')
    {
        return null;
    }

    if (Array.isArray(value))
    {
        for (const item of value)
        {
            const found = findStringByKeys(item, keys, depth + 1);
            if (found) return found;
        }

        return null;
    }

    const objectValue = value as Record<string, unknown>;

    for (const key of keys)
    {
        const direct = getString(objectValue[key]);
        if (direct) return direct;
    }

    for (const nested of Object.values(objectValue))
    {
        const found = findStringByKeys(nested, keys, depth + 1);
        if (found) return found;
    }

    return null;
}

function extractCustomData(data: Record<string, unknown>)
{
    return {
        ...getObject(data.custom_data),
        ...getObject(data.customData)
    };
}

function extractPriceId(data: Record<string, unknown>)
{
    const direct = getString(data.price_id) ?? getString(data.priceId);
    if (direct) return direct;

    const items = Array.isArray(data.items) ? data.items : [];
    const firstItem = getObject(items[0]);
    const price = getObject(firstItem.price);
    return getString(firstItem.price_id) ?? getString(firstItem.priceId) ?? getString(price.id);
}

async function resolveSubscriptionTarget(data: Record<string, unknown>)
{
    const customData = extractCustomData(data);
    const tenantId = getNumber(customData.tenantId ?? customData.tenant_id);
    const pricingPlanId = getNumber(customData.pricingPlanId ?? customData.pricing_plan_id);
    const planSlug = getString(customData.planSlug ?? customData.plan_slug);
    const subscriptionId = getString(data.subscription_id) ?? getString(data.subscriptionId) ?? getString(data.id);
    const customerId = getString(data.customer_id) ?? getString(data.customerId);
    const customer = getObject(data.customer);
    const customerEmail = getString(data.customer_email) ?? getString(customer.email);

    if (tenantId)
    {
        requireValidCheckoutCustomData(customData);
        return { tenantId, pricingPlanId, planSlug };
    }

    if (subscriptionId || customerId)
    {
        const matchConditions: Array<Record<string, string>> = [];

        if (subscriptionId) matchConditions.push({ providerSubscriptionId: subscriptionId });
        if (customerId) matchConditions.push({ providerCustomerId: customerId });

        const existing = await TenantSubscription.findOne(
            {
                where:
                {
                    [Op.or]: matchConditions
                }
            }
        );

        if (existing)
        {
            return { tenantId: existing.tenantId, pricingPlanId: existing.pricingPlanId, planSlug };
        }
    }

    if (customerEmail)
    {
        const user = await User.findOne({ where: { email: customerEmail.toLowerCase(), status: 'active' } });

        if (user)
        {
            return { tenantId: user.tenantId, pricingPlanId, planSlug };
        }
    }

    return { tenantId: null, pricingPlanId, planSlug };
}

async function resolvePricingPlanId(pricingPlanId: number | null | undefined, planSlug: string | null | undefined, priceId: string | null)
{
    if (pricingPlanId)
    {
        const plan = await PricingPlan.findByPk(pricingPlanId);
        if (plan) return plan.id;
    }

    if (planSlug)
    {
        const plan = await PricingPlan.findOne({ where: { slug: normalizePlanSlug(planSlug), isActive: true } });
        if (plan) return plan.id;
    }

    if (priceId)
    {
        const matchingSlug = Object.entries(paddlePriceByPlanSlug).find(([, resolver]) => resolver() === priceId)?.[0];
        if (matchingSlug)
        {
            const plan = await PricingPlan.findOne({ where: { slug: matchingSlug, isActive: true } });
            if (plan) return plan.id;
        }
    }

    const fallback = await PricingPlan.findOne({ where: { isActive: true }, order: [['sortOrder', 'ASC']] });
    return fallback?.id ?? null;
}

function mapPaddleStatus(eventType: string, dataStatus: string | null)
{
    const normalizedStatus = dataStatus || '';

    if (eventType === 'transaction.payment_failed')
    {
        return 'past_due';
    }

    if (eventType === 'subscription.past_due')
    {
        return 'past_due';
    }

    if (eventType === 'subscription.paused')
    {
        return 'paused';
    }

    if (eventType === 'subscription.resumed')
    {
        return 'active';
    }

    if (eventType === 'subscription.canceled' || eventType === 'subscription.cancelled')
    {
        return 'cancelled';
    }

    if (['active', 'trialing'].includes(normalizedStatus))
    {
        return 'active';
    }

    if (['past_due', 'paused'].includes(normalizedStatus))
    {
        return normalizedStatus;
    }

    if (eventType === 'transaction.completed')
    {
        return ['completed', 'paid', 'billed'].includes(normalizedStatus) ? 'active' : 'pending';
    }

    return 'pending';
}

async function applyPaddleWebhook(payload: PaddleWebhookPayload)
{
    const eventType = payload.event_type ?? payload.eventType ?? '';
    const data = getObject(payload.data);

    if (!eventType || !data)
    {
        throw new Error('Invalid Paddle webhook payload');
    }

    const target = await resolveSubscriptionTarget(data);

    if (!target.tenantId)
    {
        throw new Error('Paddle webhook could not be matched to a workspace');
    }

    const customData = extractCustomData(data);
    const priceId = extractPriceId(data) ?? getString(customData.priceId ?? customData.price_id);
    const pricingPlanId = await resolvePricingPlanId(target.pricingPlanId, target.planSlug, priceId);

    if (!pricingPlanId)
    {
        throw new Error('Paddle webhook could not be matched to a pricing plan');
    }

    const status = mapPaddleStatus(eventType, getString(data.status));
    const billingPeriod = getObject(data.current_billing_period ?? data.currentBillingPeriod);
    const subscriptionId = getString(data.subscription_id) ?? getString(data.subscriptionId) ?? (eventType.startsWith('subscription.') ? getString(data.id) : null);
    const transactionId = eventType.startsWith('transaction.') ? getString(data.id) : getString(data.transaction_id ?? data.transactionId);
    const customerId = getString(data.customer_id) ?? getString(data.customerId);
    const eventId = getString(payload.event_id ?? payload.eventId ?? payload.id);
    const eventOccurredAt = getDate(payload.occurred_at ?? payload.occurredAt) ?? new Date();
    const currentPeriodStartsAt = getDate(billingPeriod.starts_at ?? billingPeriod.startsAt);
    const currentPeriodEndsAt = getDate(billingPeriod.ends_at ?? billingPeriod.endsAt);
    const existing = await TenantSubscription.findOne({ where: { tenantId: target.tenantId } });

    if (existing?.providerEventId && eventId && existing.providerEventId === eventId)
    {
        return existing;
    }

    if (existing?.providerEventOccurredAt && eventOccurredAt < existing.providerEventOccurredAt)
    {
        return existing;
    }

    const wasActive = existing?.status === 'active';
    const updatePayload =
    {
        pricingPlanId,
        pendingPricingPlanId: existing?.pendingPricingPlanId === pricingPlanId ? null : existing?.pendingPricingPlanId ?? null,
        pendingPlanChangeEffectiveAt: existing?.pendingPricingPlanId === pricingPlanId ? null : existing?.pendingPlanChangeEffectiveAt ?? null,
        status,
        provider: 'paddle',
        providerCustomerId: customerId ?? existing?.providerCustomerId ?? null,
        providerSubscriptionId: subscriptionId ?? existing?.providerSubscriptionId ?? null,
        providerTransactionId: transactionId ?? existing?.providerTransactionId ?? null,
        providerPriceId: priceId ?? existing?.providerPriceId ?? null,
        providerStatus: getString(data.status) ?? status,
        providerEventId: eventId ?? existing?.providerEventId ?? null,
        providerEventOccurredAt: eventOccurredAt,
        currentPeriodStartsAt: currentPeriodStartsAt ?? existing?.currentPeriodStartsAt ?? null,
        currentPeriodEndsAt: currentPeriodEndsAt ?? existing?.currentPeriodEndsAt ?? null,
        cancelledAt: status === 'cancelled' ? new Date() : null,
        cancelledBy: status === 'cancelled' ? 'paddle' : null
    };

    const subscription = existing
        ? await existing.update(updatePayload)
        : await TenantSubscription.create({ tenantId: target.tenantId, ...updatePayload });

    if (status === 'active' && !wasActive)
    {
        await queueEmailEvent(
            {
                tenantId: target.tenantId,
                type: 'plan_activated',
                subject: `${env.appName} plan activated`,
                payload:
                {
                    provider: 'Paddle',
                    planId: pricingPlanId,
                    activatedAt: new Date().toISOString()
                }
            }
        );
    }

    if (status === 'past_due')
    {
        await queueEmailEvent(
            {
                tenantId: target.tenantId,
                type: 'payment_failed',
                subject: `${env.appName} payment could not be completed`,
                payload:
                {
                    provider: 'Paddle',
                    eventType,
                    happenedAt: new Date().toISOString()
                }
            }
        );
    }

    return subscription;
}

async function syncPaddleCheckoutCompletion(tenantId: number, clientPayload: PaddleClientEventPayload)
{
    const eventName = getString(clientPayload.name ?? clientPayload.eventName ?? clientPayload.type ?? clientPayload.event_type) ?? '';
    const eventData = getObject(clientPayload.data) || clientPayload;
    const directData = Object.keys(eventData).length ? eventData : clientPayload;
    const transactionId = findStringByKeys(directData, ['transaction_id', 'transactionId'])
        ?? (eventName.includes('transaction') ? getString((directData as Record<string, unknown>).id) : null);
    const subscriptionId = findStringByKeys(directData, ['subscription_id', 'subscriptionId'])
        ?? (eventName.includes('subscription') ? getString((directData as Record<string, unknown>).id) : null);

    let subscription = null;

    if (transactionId)
    {
        const transaction = await fetchPaddleTransaction(transactionId);
        subscription = await applyPaddleWebhook(
            {
                id: `client-sync-transaction-${transactionId}`,
                event_type: 'transaction.completed',
                data: transaction
            }
        );
    }
    else if (subscriptionId)
    {
        const paddleSubscription = await fetchPaddleSubscription(subscriptionId);
        subscription = await applyPaddleWebhook(
            {
                id: `client-sync-subscription-${subscriptionId}`,
                event_type: 'subscription.updated',
                data: paddleSubscription
            }
        );
    }
    else
    {
        throw new Error('Paddle checkout completion did not include a transaction or subscription id');
    }

    if (!subscription || subscription.tenantId !== tenantId)
    {
        throw new Error('Paddle checkout could not be matched to this workspace');
    }

    if (!['active', 'trialing'].includes(subscription.status))
    {
        throw new Error('Paddle checkout has not created an active subscription yet');
    }

    return subscription;
}

async function syncPaddleSubscriptionByCustomerEmail(tenantId: number, email: string)
{
    const customers = await findPaddleCustomersByEmail(email);

    for (const customer of customers)
    {
        const customerId = getString(customer.id);
        if (!customerId) continue;

        const subscriptions = await findPaddleSubscriptionsByCustomer(customerId);
        const candidates = subscriptions
            .filter((subscription) => ['active', 'trialing', 'past_due', 'paused'].includes(getString(subscription.status) ?? ''))
            .sort((left, right) => {
                const leftTime = getDate(left.updated_at ?? left.updatedAt)?.getTime() ?? 0;
                const rightTime = getDate(right.updated_at ?? right.updatedAt)?.getTime() ?? 0;
                return rightTime - leftTime;
            });

        for (const candidate of candidates)
        {
            try
            {
                const subscription = await applyPaddleWebhook(
                    {
                        id: `email-sync-subscription-${getString(candidate.id) ?? Date.now()}`,
                        event_type: 'subscription.updated',
                        data: candidate
                    }
                );

                if (subscription.tenantId === tenantId)
                {
                    return subscription;
                }
            }
            catch (error)
            {
                // Continue scanning; another subscription may carry the signed checkout metadata.
            }
        }
    }

    throw new Error('No verified Paddle subscription was found for this workspace');
}

export {
    applyPaddleWebhook,
    cancelPaddleSubscription,
    createCheckoutToken,
    createPaddlePaymentMethodUpdateUrl,
    getCheckoutConfig,
    getPaddleCustomerPaymentMethodSummary,
    getPaddlePriceId,
    syncPaddleCheckoutCompletion,
    syncPaddleSubscriptionByCustomerEmail,
    updatePaddleSubscriptionPlan,
    verifyCheckoutToken,
    verifyPaddleWebhookSignature
};
