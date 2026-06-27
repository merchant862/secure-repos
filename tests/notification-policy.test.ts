import { reportCadenceForSchedule } from '../src/app/services/notification.service';
import { renderEmailTemplate } from '../src/app/services/email-template.service';

describe('Plan-controlled notification policy', function ()
{
    it('uses weekly reports for weekly plans and daily reports for daily plans', function ()
    {
        expect(reportCadenceForSchedule('weekly')).toEqual(
            { label: 'Weekly', intervalMs: 7 * 24 * 60 * 60 * 1000 }
        );
        expect(reportCadenceForSchedule('daily')).toEqual(
            { label: 'Daily', intervalMs: 24 * 60 * 60 * 1000 }
        );
        expect(reportCadenceForSchedule('daily_and_push')).toEqual(
            { label: 'Daily', intervalMs: 24 * 60 * 60 * 1000 }
        );
    });

    it('renders the report cadence supplied by the active plan', function ()
    {
        const html = renderEmailTemplate(
            'weekly_report',
            {
                cadenceLabel: 'Daily',
                critical: 1,
                high: 2,
                total: 3
            }
        );

        expect(html).toContain('Daily security report');
        expect(html).not.toContain('Weekly security report');
    });
});
