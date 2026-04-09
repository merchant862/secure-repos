import { Request, Response } from 'express';
import { buildGithubAppInstallUrl } from '../../../modules/github/github.service';

function githubInstallStartController(req: Request, res: Response)
{
    const tenantId = req.query.tenant_id ? String(req.query.tenant_id) : undefined;
    const installUrl = buildGithubAppInstallUrl(tenantId);

    return res.status(200).json(
        {
            message: 'GitHub install URL generated',
            data:
            {
                installUrl
            }
        }
    );
}

export {
    githubInstallStartController
};
