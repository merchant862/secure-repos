(function () {
    const pageLimit = 25;
    const root = document.documentElement;
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

    root.dataset.theme = savedTheme || (prefersDark ? 'dark' : 'light');

    const paginationState = {
        repositories: { cursor: null, hasMore: false },
        scans: { cursor: null, hasMore: false },
        tenants: { cursor: null, hasMore: false }
    };

    let pricingPlans = [];

    function getToken() {
        return document.body.matches('[data-admin-panel]') ? 'cookie-session' : '';
    }

    function setToken(token, expiresAt) {
        localStorage.removeItem('secure_repos_admin_token');
        localStorage.removeItem('secure_repos_admin_expires_at');
    }

    function clearToken() {
        localStorage.removeItem('secure_repos_admin_token');
        localStorage.removeItem('secure_repos_admin_expires_at');
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, function (char) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char];
        });
    }

    function money(cents, currency) {
        return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(Number(cents || 0) / 100);
    }

    function formatDate(value) {
        if (!value) {
            return '-';
        }

        return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function adminInitials(admin) {
        const source = String(admin?.name || admin?.email || 'A').trim();
        const parts = source.split(/\s+/).filter(Boolean);

        return parts.length > 1
            ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
            : source.slice(0, 2).toUpperCase();
    }

    function showStatus(message, isError) {
        document.querySelectorAll('[data-admin-status]').forEach(function (node) {
            node.textContent = message || '';
            node.style.color = isError ? 'var(--danger)' : 'var(--muted)';
        });
    }

    function toggleTheme() {
        root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', root.dataset.theme);
    }

    function setMobileMenu(open) {
        document.body.classList.toggle('admin-menu-open', open);
    }

    function setAdminActions(open) {
        document.body.classList.toggle('admin-actions-open', open);
    }

    async function adminFetch(path, options) {
        const headers = Object.assign({ 'Content-Type': 'application/json' }, options && options.headers ? options.headers : {});
        const response = await fetch(path, Object.assign({}, options, { headers, credentials: 'same-origin' }));
        const payload = await response.json().catch(function () {
            return {};
        });

        if (response.status === 401) {
            clearToken();
            window.location.href = '/admin/sign-in';
            throw new Error('Unauthorized');
        }

        if (!response.ok) {
            throw new Error(payload.message || 'Request failed');
        }

        return payload;
    }

    const loginForm = document.querySelector('[data-admin-login]');
    if (loginForm) {
        loginForm.addEventListener('submit', async function (event) {
            event.preventDefault();
            const button = loginForm.querySelector('button[type="submit"]');
            const original = button ? button.textContent : '';

            if (button) {
                button.disabled = true;
                button.textContent = 'Signing in...';
            }

            try {
                const body = Object.fromEntries(new FormData(loginForm).entries());
                const payload = await adminFetch('/api/admin/auth/login', { method: 'POST', body: JSON.stringify(body) });
                setToken();
                window.location.href = '/admin/overview';
            } catch (error) {
                showStatus(error.message, true);
            } finally {
                if (button) {
                    button.disabled = false;
                    button.textContent = original;
                }
            }
        });
    }

    if (!document.body.matches('[data-admin-panel]')) {
        return;
    }


    const currentPage = document.body.dataset.adminPage || 'overview';

    function table(name) {
        return document.querySelector(`[data-admin-table="${name}"]`);
    }

    function renderRows(name, columns, rows, append) {
        const tbody = table(name);

        if (!tbody) {
            return;
        }

        if (!append || tbody.textContent.trim() === 'Loading...') {
            tbody.innerHTML = rows || `<tr><td colspan="${columns}">No records found.</td></tr>`;
            return;
        }

        tbody.insertAdjacentHTML('beforeend', rows || '');
    }

    function updatePager(name, payload) {
        const state = paginationState[name];
        const button = document.querySelector(`[data-admin-page-next="${name}"]`);

        if (!state || !button) {
            return;
        }

        state.cursor = payload.pagination?.nextCursor || null;
        state.hasMore = Boolean(state.cursor);
        button.disabled = !state.hasMore;
        button.textContent = state.hasMore ? 'Load more' : 'No more records';
    }

    function paginatedPath(path, name, append) {
        const state = paginationState[name];
        const params = new URLSearchParams({ limit: String(pageLimit) });

        if (append && state?.cursor) {
            params.set('cursor', String(state.cursor));
        }

        return `${path}?${params.toString()}`;
    }

    function planOptions(selectedId) {
        return pricingPlans.map(function (plan) {
            const selected = Number(selectedId) === Number(plan.id) ? 'selected' : '';
            return `<option value="${plan.id}" ${selected}>${escapeHtml(plan.name)}</option>`;
        }).join('');
    }

    function planFeaturesText(plan) {
        return (plan.features || []).map(function (feature) {
            return feature.label;
        }).join('\n');
    }

    function currentPlan(planId) {
        return pricingPlans.find((plan) => Number(plan.id) === Number(planId));
    }

    async function hydrateAdmin() {
        const payload = await adminFetch('/api/admin/auth/me');
        const admin = payload.data;
        const identity = document.querySelector('[data-admin-identity]');
        const avatar = document.querySelector('[data-admin-avatar]');

        if (identity && admin) {
            identity.textContent = admin.name || admin.email;
        }
        if (avatar && admin) {
            avatar.textContent = adminInitials(admin);
        }
    }

    async function hydratePlans() {
        const payload = await adminFetch('/api/admin/pricing-plans');
        pricingPlans = payload.data || [];
        const activeCount = pricingPlans.filter((plan) => plan.isActive).length;
        const planCount = document.querySelector('[data-plan-count]');
        const createForm = document.querySelector('[data-admin-form="pricing-create"]');

        if (planCount) {
            planCount.textContent = `${activeCount} / 2 active`;
        }
        if (createForm) {
            const button = createForm.querySelector('button[type="submit"]');
            if (button) {
                button.disabled = activeCount >= 2;
                button.textContent = activeCount >= 2 ? 'Package limit reached' : 'Create plan';
            }
        }

        const rows = pricingPlans.map(function (plan) {
            const status = plan.isActive ? 'active' : 'inactive';
            const badge = plan.isActive ? 'success' : 'warning';
            return `<tr>
                <td><a href="#" class="admin-plan-link" data-admin-action="open-plan" data-plan-id="${plan.id}">${escapeHtml(plan.name)}</a><p class="muted small" style="margin:4px 0 0">${escapeHtml(plan.slug)}${plan.isHighlighted ? ' · highlighted' : ''}</p></td>
                <td>${money(plan.priceMonthlyCents, plan.currency)}</td>
                <td><span class="badge ${badge}">${status}</span></td>
                <td>
                    <div class="admin-inline-actions">
                        <button class="button" type="button" data-admin-action="open-plan" data-plan-id="${plan.id}">Details</button>
                        <button class="button danger" type="button" data-admin-action="deactivate-plan" data-plan-id="${plan.id}">Delete</button>
                    </div>
                </td>
            </tr>`;
        }).join('');

        renderRows('plans', 4, rows, false);
        return payload;
    }

    async function hydrateTenants(append) {
        if (!pricingPlans.length) {
            await hydratePlans();
        }

        const payload = await adminFetch(paginatedPath('/api/admin/tenants', 'tenants', append));
        const tenants = payload.data || [];
        const rows = tenants.map(function (tenant) {
            const subscription = tenant.subscription;
            const plan = subscription?.pricingPlan;
            const connection = (tenant.codeHostConnections || [])[0];
            return `<tr>
                <td>${tenant.id}</td>
                <td><strong>${escapeHtml(tenant.name)}</strong><p class="muted small">${escapeHtml(tenant.slug)}</p></td>
                <td>${escapeHtml(plan?.name || '-')}</td>
                <td><span class="badge brand">${escapeHtml(subscription?.status || 'none')}</span></td>
                <td>${escapeHtml(connection?.accountLogin || '-')}</td>
                <td>
                    <div class="admin-inline-actions">
                        <select class="input compact" data-tenant-plan="${tenant.id}">${planOptions(plan?.id)}</select>
                        <select class="input compact" data-tenant-status="${tenant.id}">
                            <option value="active" ${subscription?.status === 'active' ? 'selected' : ''}>active</option>
                            <option value="pending" ${subscription?.status === 'pending' ? 'selected' : ''}>pending</option>
                            <option value="cancelled" ${subscription?.status === 'cancelled' ? 'selected' : ''}>cancelled</option>
                        </select>
                        <button class="button" type="button" data-admin-action="assign-plan" data-tenant-id="${tenant.id}">Assign</button>
                        <button class="button danger" type="button" data-admin-action="cancel-tenant" data-tenant-id="${tenant.id}">Cancel</button>
                    </div>
                </td>
            </tr>`;
        }).join('');

        renderRows('tenants', 6, rows, append);
        updatePager('tenants', payload);
        return payload;
    }

    async function hydrateProviderSettings() {
        const payload = await adminFetch('/api/admin/provider-settings/github');
        const provider = payload.data;
        const form = document.querySelector('[data-admin-form="provider-github"]');

        if (!form || !provider) {
            return payload;
        }

        form.displayName.value = provider.displayName || '';
        form.connectLabel.value = provider.connectLabel || '';
        form.isEnabled.checked = Boolean(provider.isEnabled);
        form.setupInstructions.value = provider.setupInstructions || '';
        form.triggerFirstScan.checked = provider.scanDefaults?.triggerFirstScan !== false;
        form.availableSoloStarter.checked = provider.planAvailability?.['solo-starter'] !== false;
        form.availableSoloPro.checked = provider.planAvailability?.['solo-pro'] !== false;
        return payload;
    }

    async function hydrateOverview() {
        const [plans, overview] = await Promise.all([
            hydratePlans(),
            adminFetch('/api/admin/overview')
        ]);
        const overviewData = overview.data || {};

        document.querySelector('[data-stat="plans"]').textContent = String((plans.data || []).length);
        document.querySelector('[data-stat="tenants"]').textContent = String(overviewData.tenants ?? 0);
        document.querySelector('[data-stat="revenue"]').textContent = money(overviewData.estimatedMrrCents || 0, overviewData.estimatedMrrCurrency || 'USD');
        await hydrateTenants(false);
    }

    async function hydrateCurrentPage() {
        showStatus('Loading admin data...');

        try {
            await hydrateAdmin();

            if (currentPage === 'overview') {
                await hydrateOverview();
            }

            if (currentPage === 'pricing') {
                await hydratePlans();
            }

            if (currentPage === 'provider') {
                await hydrateProviderSettings();
            }

            showStatus('');
        } catch (error) {
            showStatus(error.message, true);
        }
    }

    function pricingPayload(form) {
        const data = Object.fromEntries(new FormData(form).entries());
        const features = String(data.features || '').split('\n').map(function (item) {
            return item.trim();
        }).filter(Boolean).map(function (label, index) {
            return { label, isIncluded: true, sortOrder: (index + 1) * 10 };
        });

        return {
            name: data.name,
            slug: data.slug,
            description: data.description || null,
            priceMonthlyCents: Number(data.priceMonthlyCents || 0),
            currency: data.currency || 'USD',
            repositoryLimit: data.repositoryLimit ? Number(data.repositoryLimit) : null,
            manualScanDailyLimit: data.manualScanDailyLimit ? Number(data.manualScanDailyLimit) : null,
            manualScanCooldownMinutes: data.manualScanCooldownMinutes ? Number(data.manualScanCooldownMinutes) : 0,
            scanSchedule: data.scanSchedule || 'daily',
            sortOrder: Number(data.sortOrder || 0),
            isHighlighted: Boolean(form.querySelector('[name="isHighlighted"]')?.checked),
            features
        };
    }

    function planPayloadFromModal(form) {
        const data = Object.fromEntries(new FormData(form).entries());
        const features = String(data.features || '').split('\n').map(function (item) {
            return item.trim();
        }).filter(Boolean).map(function (label, index) {
            return { label, isIncluded: true, sortOrder: (index + 1) * 10 };
        });

        return {
            name: data.name,
            slug: data.slug,
            description: data.description || null,
            priceMonthlyCents: Number(data.priceMonthlyCents || 0),
            currency: data.currency || 'USD',
            repositoryLimit: data.repositoryLimit ? Number(data.repositoryLimit) : null,
            manualScanDailyLimit: data.manualScanDailyLimit ? Number(data.manualScanDailyLimit) : null,
            manualScanCooldownMinutes: data.manualScanCooldownMinutes ? Number(data.manualScanCooldownMinutes) : 0,
            scanSchedule: data.scanSchedule || 'daily',
            sortOrder: Number(data.sortOrder || 0),
            isActive: data.isActive === 'true',
            isHighlighted: Boolean(form.querySelector('[name="isHighlighted"]')?.checked),
            features
        };
    }

    function fillPlanModal(planId) {
        const plan = currentPlan(planId);
        const overlay = document.querySelector('[data-plan-modal]');
        const form = document.querySelector('[data-plan-modal-form]');
        const title = document.querySelector('[data-plan-modal-title]');

        if (!plan || !overlay || !form) {
            return;
        }

        form.planId.value = plan.id;
        form.name.value = plan.name || '';
        form.slug.value = plan.slug || '';
        form.priceMonthlyCents.value = plan.priceMonthlyCents ?? 0;
        form.currency.value = plan.currency || 'USD';
        form.repositoryLimit.value = plan.repositoryLimit ?? '';
        form.manualScanDailyLimit.value = plan.manualScanDailyLimit ?? '';
        form.manualScanCooldownMinutes.value = plan.manualScanCooldownMinutes ?? 0;
        form.scanSchedule.value = plan.scanSchedule || 'daily';
        form.sortOrder.value = plan.sortOrder ?? 0;
        form.isActive.value = plan.isActive ? 'true' : 'false';
        form.description.value = plan.description || '';
        form.features.value = planFeaturesText(plan);
        form.isHighlighted.checked = Boolean(plan.isHighlighted);

        if (title) {
            title.textContent = plan.name || 'Package details';
        }

        overlay.hidden = false;
    }

    function closePlanModal() {
        const overlay = document.querySelector('[data-plan-modal]');

        if (overlay) {
            overlay.hidden = true;
        }
    }

    document.addEventListener('submit', async function (event) {
        const form = event.target.closest('[data-admin-form], [data-plan-modal-form]');

        if (!form) {
            return;
        }

        event.preventDefault();

        try {
            if (form.matches('[data-plan-modal-form]')) {
                const planId = form.planId.value;
                await adminFetch(`/api/admin/pricing-plans/${planId}`, { method: 'PUT', body: JSON.stringify(planPayloadFromModal(form)) });
                closePlanModal();
                await hydratePlans();
                showStatus('Pricing plan updated.');
                return;
            }

            if (form.dataset.adminForm === 'pricing-create') {
                await adminFetch('/api/admin/pricing-plans', { method: 'POST', body: JSON.stringify(pricingPayload(form)) });
                form.reset();
                await hydratePlans();
                showStatus('Pricing plan created.');
            }

            if (form.dataset.adminForm === 'provider-github') {
                const body = {
                    displayName: form.displayName.value,
                    connectLabel: form.connectLabel.value,
                    sortOrder: 0,
                    isEnabled: Boolean(form.isEnabled.checked),
                    setupInstructions: form.setupInstructions.value || null,
                    scanDefaults: {
                        triggerFirstScan: Boolean(form.triggerFirstScan.checked)
                    },
                    planAvailability: {
                        'solo-starter': Boolean(form.availableSoloStarter.checked),
                        'solo-pro': Boolean(form.availableSoloPro.checked)
                    },
                    metadata: {}
                };
                await adminFetch('/api/admin/provider-settings/github', { method: 'PUT', body: JSON.stringify(body) });
                await hydrateProviderSettings();
                showStatus('Provider settings saved.');
            }

            if (form.dataset.adminForm === 'password-change') {
                if (form.newPassword.value !== form.confirmPassword.value) {
                    throw new Error('New password and confirmation do not match.');
                }

                await adminFetch('/api/admin/auth/password', {
                    method: 'PUT',
                    body: JSON.stringify(
                        {
                            currentPassword: form.currentPassword.value,
                            newPassword: form.newPassword.value
                        }
                    )
                });
                form.reset();
                clearToken();
                window.location.href = '/admin/sign-in';
                return;
            }
        } catch (error) {
            showStatus(error.message, true);
        }
    });

    document.addEventListener('click', async function (event) {
        const logout = event.target.closest('[data-admin-logout]');
        const refresh = event.target.closest('[data-admin-refresh]');
        const theme = event.target.closest('[data-admin-theme-toggle]');
        const menu = event.target.closest('[data-admin-menu-toggle]');
        const actionsToggle = event.target.closest('[data-admin-actions-toggle]');
        const actionsPanel = event.target.closest('[data-admin-actions]');
        const overlay = event.target.closest('[data-admin-menu-overlay]');
        const next = event.target.closest('[data-admin-page-next]');
        const action = event.target.closest('[data-admin-action]');
        const modalClose = event.target.closest('[data-plan-modal-close]');
        const modalOverlay = event.target.matches('[data-plan-modal]');
        const modalDelete = event.target.closest('[data-plan-modal-delete]');
        const passwordToggle = event.target.closest('[data-password-toggle]');

        if (theme) {
            toggleTheme();
            setAdminActions(false);
            return;
        }

        if (actionsToggle) {
            setAdminActions(!document.body.classList.contains('admin-actions-open'));
            return;
        }

        if (!actionsPanel) {
            setAdminActions(false);
        }

        if (passwordToggle) {
            const field = passwordToggle.closest('.password-field');
            const input = field?.querySelector('input');

            if (input) {
                const visible = input.type === 'text';
                input.type = visible ? 'password' : 'text';
                passwordToggle.textContent = visible ? 'Show' : 'Hide';
            }
            return;
        }

        if (modalClose || modalOverlay) {
            closePlanModal();
            return;
        }

        if (modalDelete) {
            const form = document.querySelector('[data-plan-modal-form]');
            const planId = form?.planId.value;

            if (planId) {
                try {
                    await adminFetch(`/api/admin/pricing-plans/${planId}`, { method: 'DELETE' });
                    closePlanModal();
                    await hydratePlans();
                    showStatus('Pricing plan deleted.');
                } catch (error) {
                    showStatus(error.message, true);
                }
            }
            return;
        }

        if (menu) {
            setMobileMenu(true);
            return;
        }

        if (overlay) {
            setMobileMenu(false);
            return;
        }

        if (logout) {
            try {
                await adminFetch('/api/admin/auth/logout', { method: 'POST' });
            } catch (error) {
                // Local token removal is enough if the session is already expired.
            }
            clearToken();
            window.location.href = '/admin/sign-in';
            return;
        }

        if (refresh) {
            setAdminActions(false);
            hydrateCurrentPage();
            return;
        }

        if (next) {
            const name = next.dataset.adminPageNext;
            if (name === 'tenants') {
                await hydrateTenants(true);
            }
            return;
        }

        if (!action) {
            return;
        }

        try {
            const type = action.dataset.adminAction;

            if (type === 'open-plan') {
                event.preventDefault();
                fillPlanModal(action.dataset.planId);
                return;
            }

            if (type === 'deactivate-plan') {
                await adminFetch(`/api/admin/pricing-plans/${action.dataset.planId}`, { method: 'DELETE' });
                await hydratePlans();
                showStatus('Pricing plan deleted.');
            }

            if (type === 'assign-plan') {
                const tenantId = action.dataset.tenantId;
                const plan = document.querySelector(`[data-tenant-plan="${tenantId}"]`);
                const status = document.querySelector(`[data-tenant-status="${tenantId}"]`);
                await adminFetch(`/api/admin/tenants/${tenantId}/plan`, { method: 'PUT', body: JSON.stringify({ pricingPlanId: Number(plan.value), status: status.value }) });
                await hydrateTenants(false);
                showStatus('Tenant plan assigned.');
            }

            if (type === 'cancel-tenant') {
                await adminFetch(`/api/admin/tenants/${action.dataset.tenantId}/subscription/cancel`, { method: 'POST' });
                await hydrateTenants(false);
                showStatus('Tenant subscription cancelled.');
            }

        } catch (error) {
            showStatus(error.message, true);
        }
    });

    hydrateCurrentPage();
})();
