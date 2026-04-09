import { Tenant } from '../../db/models/tenant.model';

type EnsureTenantInput =
{
    tenantId?: number;
    fallbackName: string;
    fallbackSlugSource: string;
};

function slugifyTenantValue(value: string): string
{
    const normalizedValue = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return normalizedValue || 'default-tenant';
}

async function findTenantById(id: number)
{
    return Tenant.findByPk(id);
}

async function findTenantBySlug(slug: string)
{
    return Tenant.findOne(
        {
            where:
            {
                slug
            }
        }
    );
}

async function createTenant(name: string, slug: string)
{
    return Tenant.create(
        {
            name,
            slug
        }
    );
}

async function ensureTenantExists(input: EnsureTenantInput)
{
    if (input.tenantId)
    {
        const existingTenant = await findTenantById(input.tenantId);

        if (existingTenant)
        {
            return existingTenant;
        }
    }

    const baseSlug = slugifyTenantValue(input.fallbackSlugSource);
    let slug = baseSlug;
    let suffix = 1;

    while (true)
    {
        const existingTenant = await findTenantBySlug(slug);

        if (!existingTenant)
        {
            return createTenant(input.fallbackName, slug);
        }

        if (input.tenantId && existingTenant.id === input.tenantId)
        {
            return existingTenant;
        }

        suffix += 1;
        slug = `${baseSlug}-${suffix}`;
    }
}

export {
    ensureTenantExists,
    findTenantById,
    findTenantBySlug
};
