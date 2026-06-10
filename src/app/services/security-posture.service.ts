import { Op } from 'sequelize';

import { Finding, Repository, Scan, SecurityScoreSnapshot } from '../../db/models';

const severityWeights =
{
    critical: 25,
    high: 12,
    medium: 5,
    low: 2
};

async function calculateRepositorySecurityScore(repositoryId: number): Promise<number>
{
    const findings = await Finding.findAll(
        {
            where:
            {
                repositoryId,
                status: 'open',
                [Op.or]:
                [
                    { ignoredUntil: null },
                    {
                        ignoredUntil:
                        {
                            [Op.lt]: new Date()
                        }
                    }
                ]
            }
        }
    );
    const penalty = findings.reduce(function (total, finding)
    {
        return total + (severityWeights[finding.severity as keyof typeof severityWeights] ?? 1);
    }, 0);

    return Math.max(0, Math.min(100, 100 - penalty));
}

async function refreshRepositorySecurityScore(repositoryId: number)
{
    const score = await calculateRepositorySecurityScore(repositoryId);
    const repository = await Repository.findByPk(repositoryId);
    const counts = await Finding.findAll(
        {
            where:
            {
                repositoryId,
                status: 'open'
            }
        }
    );
    const summary = { critical: 0, high: 0, medium: 0, low: 0 };

    for (const finding of counts)
    {
        if (finding.severity === 'critical' || finding.severity === 'high' || finding.severity === 'medium' || finding.severity === 'low')
        {
            summary[finding.severity] += 1;
        }
    }

    await Repository.update(
        {
            securityScore: score
        },
        {
            where:
            {
                id: repositoryId
            }
        }
    );

    if (repository)
    {
        const scan = await Scan.findOne({ where: { repositoryId }, order: [['createdAt', 'DESC']] });

        if (scan)
        {
            await SecurityScoreSnapshot.create(
                {
                    tenantId: scan.tenantId,
                    repositoryId,
                    score,
                    criticalCount: summary.critical,
                    highCount: summary.high,
                    mediumCount: summary.medium,
                    lowCount: summary.low,
                    capturedAt: new Date()
                }
            );
        }
    }

    return score;
}

async function markScanAsBaseline(scanId: number)
{
    const scan = await Scan.findByPk(scanId);

    if (!scan)
    {
        return null;
    }

    await Repository.update(
        {
            baselineScanId: scan.id
        },
        {
            where:
            {
                id: scan.repositoryId
            }
        }
    );

    return scan;
}

async function getRepositoryChecklist(repositoryId: number)
{
    const findings = await Finding.findAll(
        {
            where:
            {
                repositoryId,
                status: 'open'
            }
        }
    );
    const ruleIds = new Set(findings.map((finding) => finding.ruleId));

    return [
        {
            key: 'no_committed_env',
            label: 'No committed .env files',
            passed: !ruleIds.has('repo.env-file-committed')
        },
        {
            key: 'no_committed_keys',
            label: 'No private key files committed',
            passed: !ruleIds.has('repo.key-file-committed') && !ruleIds.has('secret.private-key')
        },
        {
            key: 'no_detected_tokens',
            label: 'No high-risk tokens detected',
            passed: !Array.from(ruleIds).some((ruleId) => ruleId.startsWith('secret.'))
        },
        {
            key: 'least_privilege_ci',
            label: 'CI workflows avoid broad privileges',
            passed: !ruleIds.has('ci.write-all-permissions') && !ruleIds.has('ci.pull-request-target')
        },
        {
            key: 'container_non_root',
            label: 'Containers avoid default root execution',
            passed: !ruleIds.has('container.no-user')
        }
    ];
}

async function updateFindingWorkflow(
    findingId: number,
    input: { status?: string; assignedToUserId?: number | null; ignoredUntil?: Date | null }
)
{
    const finding = await Finding.findByPk(findingId);

    if (!finding)
    {
        return null;
    }

    await finding.update(
        {
            status: input.status ?? finding.status,
            assignedToUserId: input.assignedToUserId === undefined ? finding.assignedToUserId : input.assignedToUserId,
            ignoredUntil: input.ignoredUntil === undefined ? finding.ignoredUntil : input.ignoredUntil,
            resolvedAt: input.status === 'resolved' ? new Date() : finding.resolvedAt
        }
    );

    await refreshRepositorySecurityScore(finding.repositoryId);

    return finding;
}

export {
    refreshRepositorySecurityScore,
    markScanAsBaseline,
    getRepositoryChecklist,
    updateFindingWorkflow
};
