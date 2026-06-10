import https from 'https';
import { URL } from 'url';

type HttpRequestOptions =
{
    method?: string;
    headers?: Record<string, string | undefined>;
    body?: object | string;
    responseType?: 'json' | 'text';
};

function httpRequest<T>(urlValue: string, options: HttpRequestOptions = {}): Promise<T>
{
    return new Promise(function (resolve, reject)
    {
        const url = new URL(urlValue);
        const body = typeof options.body === 'string'
            ? options.body
            : options.body
                ? JSON.stringify(options.body)
                : undefined;
        const request = https.request(
            {
                hostname: url.hostname,
                path: `${url.pathname}${url.search}`,
                port: url.port || 443,
                method: options.method ?? 'GET',
                headers:
                {
                    ...options.headers,
                    'Content-Length': body ? Buffer.byteLength(body) : undefined,
                    'User-Agent': 'micro-saas-security-platform'
                }
            },
            function (response)
            {
                const chunks: Buffer[] = [];

                response.on('data', function (chunk)
                {
                    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                });

                response.on('end', function ()
                {
                    const raw = Buffer.concat(chunks).toString('utf8');
                    const statusCode = response.statusCode ?? 500;

                    if (statusCode < 200 || statusCode >= 300)
                    {
                        reject(new Error(`HTTP request failed (${statusCode}): ${raw}`));
                        return;
                    }

                    if (options.responseType === 'text')
                    {
                        resolve(raw as T);
                        return;
                    }

                    resolve(raw ? JSON.parse(raw) as T : {} as T);
                });
            }
        );

        request.on('error', reject);

        if (body)
        {
            request.write(body);
        }

        request.end();
    });
}

export {
    httpRequest
};
