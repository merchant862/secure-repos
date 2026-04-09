import { assertGithubEnv, env } from '../../bootstrap/env';
import { GithubConfig } from './github.types';

function getGithubConfig(): GithubConfig
{
    assertGithubEnv();

    return {
        appId: env.githubAppId as string,
        appSlug: env.githubAppSlug as string,
        clientId: env.githubClientId as string,
        clientSecret: env.githubClientSecret as string,
        webhookSecret: env.githubWebhookSecret as string,
        privateKeyPath: env.githubPrivateKeyPath as string
    };
}

export 
{
    getGithubConfig
};
