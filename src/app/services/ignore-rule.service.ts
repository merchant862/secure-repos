import { IgnoreRule } from '../../db/models';
import { ScannerFinding } from './scan-rules.service';

function wildcardMatch(value: string, pattern: string): boolean
{
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(value);
}

async function filterIgnoredFindings(tenantId: number, findings: ScannerFinding[])
{
    const rules = await IgnoreRule.findAll(
        {
            where:
            {
                tenantId,
                isActive: true
            }
        }
    );

    return findings.filter(function (finding)
    {
        return !rules.some(function (rule)
        {
            const ruleMatches = !rule.ruleId || rule.ruleId === finding.ruleId;
            const fileMatches = !rule.filePattern || wildcardMatch(finding.filePath, rule.filePattern);
            return ruleMatches && fileMatches;
        });
    });
}

export {
    filterIgnoredFindings
};
