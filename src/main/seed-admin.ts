import { connectDatabase } from '../bootstrap/database';
import { sequelize } from '../db/sequelize';
import { seedAdmin } from '../app/services/admin-auth.service';

type AdminSeedArgs =
{
    name: string;
    email: string;
    password: string;
    role: string;
    status: string;
    updateExisting: boolean;
};

function printUsage()
{
    console.log(`Usage:
  npm run seed:admin -- --name "Admin Name" --email admin@example.com --password "StrongPassword123!"

Options:
  --name       Admin display name. Required.
  --email      Admin email address. Required.
  --password   Admin password. Required.
  --role       Admin role. Default: super_admin.
  --status     Admin status. Default: active.
  --update     Update an existing admin with the same email.
  --help       Show this message.`);
}

function readArgs(argv: string[]): AdminSeedArgs
{
    const values: Record<string, string | boolean> =
    {
        role: 'super_admin',
        status: 'active',
        updateExisting: false
    };

    for (let index = 0; index < argv.length; index += 1)
    {
        const arg = argv[index];

        if (arg === '--help' || arg === '-h')
        {
            printUsage();
            process.exit(0);
        }

        if (arg === '--update')
        {
            values.updateExisting = true;
            continue;
        }

        if (!arg.startsWith('--'))
        {
            throw new Error(`Unexpected argument: ${arg}`);
        }

        const key = arg.slice(2);
        const nextValue = argv[index + 1];

        if (!nextValue || nextValue.startsWith('--'))
        {
            throw new Error(`Missing value for ${arg}`);
        }

        values[key] = nextValue;
        index += 1;
    }

    const name = String(values.name ?? '').trim();
    const email = String(values.email ?? '').trim().toLowerCase();
    const password = String(values.password ?? '');
    const role = String(values.role ?? 'super_admin').trim();
    const status = String(values.status ?? 'active').trim();

    if (!name || !email || !password)
    {
        throw new Error('Missing required arguments: --name, --email, and --password are required.');
    }

    if (!email.includes('@'))
    {
        throw new Error('Invalid --email value.');
    }

    if (password.length < 8)
    {
        throw new Error('--password must be at least 8 characters.');
    }

    return {
        name,
        email,
        password,
        role,
        status,
        updateExisting: Boolean(values.updateExisting)
    };
}

async function main()
{
    const args = readArgs(process.argv.slice(2));

    await connectDatabase();

    const result = await seedAdmin(args);

    console.log(`${result.created ? 'Created' : 'Updated'} admin: ${result.admin.email} (${result.admin.role}, ${result.admin.status})`);
}

main()
    .catch(function (error)
    {
        console.error(error instanceof Error ? error.message : error);
        console.error('');
        printUsage();
        process.exitCode = 1;
    })
    .finally(async function ()
    {
        await sequelize.close();
    });
