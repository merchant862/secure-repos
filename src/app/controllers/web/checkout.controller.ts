import { Request, Response } from 'express';

import { env } from '../../../bootstrap/env';
import { AuthenticatedRequest, resolveUserFromRequest } from '../../middlewares/user-auth.middleware';
import { getCheckoutConfig, verifyCheckoutToken } from '../../services/paddle.service';

function privateSeo()
{
    return { robots: 'noindex,nofollow' };
}

function getCheckoutToken(req: Request)
{
    const token = Array.isArray(req.query.t) ? req.query.t[0] : req.query.t;
    return typeof token === 'string' && token.trim() !== '' ? token.trim() : '';
}

async function checkoutPageController(req: AuthenticatedRequest, res: Response)
{
    await resolveUserFromRequest(req);

    const user = req.currentUser;
    const checkoutToken = getCheckoutToken(req);
    let planSlug = '';
    let checkoutConfig = null;
    let checkoutError = '';

    if (checkoutToken)
    {
        try
        {
            planSlug = await verifyCheckoutToken(checkoutToken);
        }
        catch (error)
        {
            checkoutError = 'Invalid checkout link. Please choose a plan again.';
        }
    }

    if (user && planSlug && !checkoutError)
    {
        try
        {
            checkoutConfig = await getCheckoutConfig(
                {
                    planSlug,
                    tenantId: user.tenantId,
                    userId: user.id,
                    email: user.email,
                    name: user.name
                }
            );
        }
        catch (error)
        {
            checkoutError = error instanceof Error ? error.message : 'Checkout could not be prepared';
        }
    }

    return res.render('checkout/index',
        {
            title: 'Checkout',
            appName: env.appName,
            planSlug,
            checkoutToken,
            user,
            checkoutConfig,
            checkoutError,
            seo: privateSeo()
        });
}

export {
    checkoutPageController
};
