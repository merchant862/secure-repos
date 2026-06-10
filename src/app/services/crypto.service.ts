import crypto from 'crypto';

import { env } from '../../bootstrap/env';

function getEncryptionKey(): Buffer
{
    if (!env.tokenEncryptionKey)
    {
        throw new Error('TOKEN_ENCRYPTION_KEY is required to store provider tokens');
    }

    return crypto
        .createHash('sha256')
        .update(env.tokenEncryptionKey)
        .digest();
}

function encryptSecret(value: string): string
{
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString('base64')}.${authTag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptSecret(value: string): string
{
    const [ivValue, authTagValue, encryptedValue] = value.split('.');

    if (!ivValue || !authTagValue || !encryptedValue)
    {
        throw new Error('Invalid encrypted secret format');
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivValue, 'base64'));
    decipher.setAuthTag(Buffer.from(authTagValue, 'base64'));

    return Buffer.concat(
        [
            decipher.update(Buffer.from(encryptedValue, 'base64')),
            decipher.final()
        ]
    ).toString('utf8');
}

export {
    encryptSecret,
    decryptSecret
};
