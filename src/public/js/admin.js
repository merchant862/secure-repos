(function () {
    const tokenKey = 'secure_repos_admin_token';
    const tokenExpiryKey = 'secure_repos_admin_expires_at';
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
        return localStorage.getItem(tokenKey) || '';
    }

    function setToken(token, expiresAt) {
        localStorage.setItem(tokenKey, token);
        if (expiresAt) {
            localStorage.setItem(tokenExpiryKey, expiresAt);
        }
    }

    function clearToken() {
        localStorage.removeItem(tokenKey);
        localStorage.removeItem(tokenExpiryKey);
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

    async function adminFetch(path, options) {
        const token = getToken();
        const headers = Object.assign({ 'Content-Type': 'application/json' }, options && options.headers ? options.headers : {});

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(path, Object.assign({}, options, { headers }));
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
                setToken(payload.data?.token, payload.data?.expiresAt);
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

    if (!getToken()) {
        window.location.href = '/admin/sign-in';
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

    async function hydrateAdmin() {
        const payload = await adminFetch('/api/admin/auth/me');
        const admin = payload.data;
        const identity = document.querySelector('[data-admin-identity]');

        if (identity && admin) {
            identity.textContent = `${admin.name || admin.email} · ${admin.role}`;
        }
    }

    async function hydratePlans() {
        const payload = await adminFetch('/api/admin/pricing-plans');
        pricingPlans = payload.data || [];
        const rows = pricingPlans.map(function (plan) {
            const status = plan.isActive ? 'Active' : 'Inactive';
            const badge = plan.isActive ? 'success' : 'warning';
            const limits = `${plan.repositoryLimit ?? 'Unlimited'} repos / ${plan.teamMemberLimit ?? 'Unlimited'} seats`;
            const scanLimits = `${plan.manualScanDailyLimit ?? 'Unlimited'} manual/day · ${plan.manualScanCooldownMinutes ?? 0}m cooldown`;
            return `<tr>
                <td>${plan.id}</td>
                <td><strong>${escapeHtml(plan.name)}</strong><p class="muted small">${escapeHtml(plan.slug)}${plan.isHighlighted ? ' · highlighted' : ''}</p></td>
                <td>${money(plan.priceMonthlyCents, plan.currency)}</td>
                <td>${escapeHtml(limits)}<p class="muted small">${escapeHtml(scanLimits)}</p></td>
                <td><span class="badge ${badge}">${status}</span></td>
                <td>
                    <div class="admin-inline-actions">
                        <input class="input" type="number" min="0" placeholder="Daily" value="${plan.manualScanDailyLimit ?? ''}" data-plan-manual-limit="${plan.id}">
                        <input class="input" type="number" min="0" placeholder="Cooldown" value="${plan.manualScanCooldownMinutes ?? 0}" data-plan-cooldown="${plan.id}">
                        <button class="button" type="button" data-admin-action="update-plan-scan-limits" data-plan-id="${plan.id}">Apply limits</button>
                        <button class="button danger" type="button" data-admin-action="deactivate-plan" data-plan-id="${plan.id}" ${plan.isActive ? '' : 'disabled'}>Deactivate</button>
                    </div>
                </td>
            </tr>`;
        }).join('');

        renderRows('plans', 6, rows, false);
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

    async function hydrateRepositories(append) {
        const payload = await adminFetch(paginatedPath('/api/admin/repositories', 'repositories', append));
        const repos = payload.data || [];
        const rows = repos.map(function (repo) {
            return `<tr>
                <td>${repo.id}</td>
                <td><strong>${escapeHtml(repo.fullName || repo.name)}</strong><p class="muted small">${escapeHtml(repo.defaultBranch || 'main')}</p></td>
                <td>${escapeHtml(repo.provider || 'github')}</td>
                <td>${repo.securityScore ?? '-'}</td>
                <td><span class="badge ${repo.isActive ? 'success' : 'warning'}">${repo.isActive ? 'Active' : 'Inactive'}</span></td>
                <td>
                    <div class="admin-inline-actions">
                        <button class="button" type="button" data-admin-action="scan-repository" data-repository-id="${repo.id}">Scan</button>
                        <button class="button danger" type="button" data-admin-action="deactivate-repository" data-repository-id="${repo.id}" ${repo.isActive ? '' : 'disabled'}>Deactivate</button>
                    </div>
                </td>
            </tr>`;
        }).join('');

        renderRows('repositories', 6, rows, append);
        updatePager('repositories', payload);
        return payload;
    }

    async function hydrateScans(append) {
        const payload = await adminFetch(paginatedPath('/api/admin/scans', 'scans', append));
        const scans = payload.data || [];
        const rows = scans.map(function (scan) {
            return `<tr>
                <td>${scan.id}</td>
                <td>${escapeHtml(scan.repository?.fullName || scan.repository?.name || '-')}</td>
                <td><span class="badge brand">${escapeHtml(scan.status || '-')}</span></td>
                <td>${escapeHtml(scan.trigger || '-')}</td>
                <td>${formatDate(scan.createdAt)}</td>
                <td><button class="button" type="button" data-admin-action="retry-scan" data-scan-id="${scan.id}">Retry</button></td>
            </tr>`;
        }).join('');

        renderRows('scans', 6, rows, append);
        updatePager('scans', payload);
        return payload;
    }

    async function hydrateFindingsStat() {
        return adminFetch('/api/admin/findings/critical?limit=1');
    }

    function stringifyJson(value) {
        return JSON.stringify(value || {}, null, 2);
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
        form.sortOrder.value = provider.sortOrder ?? 0;
        form.isEnabled.checked = Boolean(provider.isEnabled);
        form.setupInstructions.value = provider.setupInstructions || '';
        form.scanDefaults.value = stringifyJson(provider.scanDefaults);
        form.planAvailability.value = stringifyJson(provider.planAvailability);
        form.metadata.value = stringifyJson(provider.metadata);
        return payload;
    }

    async function hydrateAdmins() {
        const payload = await adminFetch('/api/admin/admins');
        const admins = payload.data || [];
        const rows = admins.map(function (admin) {
            return `<tr>
                <td>${admin.id}</td>
                <td><input class="input compact" data-admin-name="${admin.id}" value="${escapeHtml(admin.name)}"></td>
                <td>${escapeHtml(admin.email)}</td>
                <td><select class="input compact" data-admin-role="${admin.id}"><option value="admin" ${admin.role === 'admin' ? 'selected' : ''}>admin</option><option value="super_admin" ${admin.role === 'super_admin' ? 'selected' : ''}>super_admin</option></select></td>
                <td><select class="input compact" data-admin-status-field="${admin.id}"><option value="active" ${admin.status === 'active' ? 'selected' : ''}>active</option><option value="disabled" ${admin.status === 'disabled' ? 'selected' : ''}>disabled</option></select></td>
                <td>${formatDate(admin.lastLoginAt)}</td>
                <td><button class="button" type="button" data-admin-action="update-admin" data-admin-id="${admin.id}">Update</button></td>
            </tr>`;
        }).join('');

        renderRows('admins', 7, rows, false);
        return payload;
    }

    async function hydrateOverview() {
        const [plans, tenants, repos, findings] = await Promise.all([
            hydratePlans(),
            adminFetch('/api/admin/tenants?limit=1'),
            adminFetch('/api/admin/repositories?limit=1'),
            hydrateFindingsStat()
        ]);

        document.querySelector('[data-stat="plans"]').textContent = String((plans.data || []).length);
        document.querySelector('[data-stat="tenants"]').textContent = String(tenants.total ?? 0);
        document.querySelector('[data-stat="repos"]').textContent = String(repos.total ?? 0);
        document.querySelector('[data-stat="findings"]').textContent = String(findings.total ?? 0);
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

            if (currentPage === 'tenants') {
                await hydrateTenants(false);
            }

            if (currentPage === 'repositories') {
                await hydrateRepositories(false);
            }

            if (currentPage === 'scans') {
                await hydrateScans(false);
            }

            if (currentPage === 'provider') {
                await hydrateProviderSettings();
            }

            if (currentPage === 'admins') {
                await hydrateAdmins();
            }

            showStatus('Admin data loaded.');
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
            teamMemberLimit: data.teamMemberLimit ? Number(data.teamMemberLimit) : null,
            manualScanDailyLimit: data.manualScanDailyLimit ? Number(data.manualScanDailyLimit) : null,
            manualScanCooldownMinutes: data.manualScanCooldownMinutes ? Number(data.manualScanCooldownMinutes) : 0,
            scanSchedule: data.scanSchedule || 'daily',
            sortOrder: Number(data.sortOrder || 0),
            isHighlighted: Boolean(form.querySelector('[name="isHighlighted"]')?.checked),
            features
        };
    }

    function parseJsonField(form, name) {
        const value = form[name].value.trim();
        return value ? JSON.parse(value) : {};
    }

    document.addEventListener('submit', async function (event) {
        const form = event.target.closest('[data-admin-form]');

        if (!form) {
            return;
        }

        event.preventDefault();

        try {
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
                    sortOrder: Number(form.sortOrder.value || 0),
                    isEnabled: Boolean(form.isEnabled.checked),
                    setupInstructions: form.setupInstructions.value || null,
                    scanDefaults: parseJsonField(form, 'scanDefaults'),
                    planAvailability: parseJsonField(form, 'planAvailability'),
                    metadata: parseJsonField(form, 'metadata')
                };
                await adminFetch('/api/admin/provider-settings/github', { method: 'PUT', body: JSON.stringify(body) });
                await hydrateProviderSettings();
                showStatus('Provider settings saved.');
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
        const overlay = event.target.closest('[data-admin-menu-overlay]');
        const next = event.target.closest('[data-admin-page-next]');
        const action = event.target.closest('[data-admin-action]');

        if (theme) {
            toggleTheme();
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
            hydrateCurrentPage();
            return;
        }

        if (next) {
            const name = next.dataset.adminPageNext;
            if (name === 'tenants') {
                await hydrateTenants(true);
            }
            if (name === 'repositories') {
                await hydrateRepositories(true);
            }
            if (name === 'scans') {
                await hydrateScans(true);
            }
            return;
        }

        if (!action) {
            return;
        }

        try {
            const type = action.dataset.adminAction;

            if (type === 'deactivate-plan') {
                await adminFetch(`/api/admin/pricing-plans/${action.dataset.planId}`, { method: 'DELETE' });
                await hydratePlans();
                showStatus('Pricing plan deactivated.');
            }

            if (type === 'update-plan-scan-limits') {
                const planId = action.dataset.planId;
                const plan = pricingPlans.find((item) => Number(item.id) === Number(planId));
                const daily = document.querySelector(`[data-plan-manual-limit="${planId}"]`).value;
                const cooldown = document.querySelector(`[data-plan-cooldown="${planId}"]`).value;

                await adminFetch(`/api/admin/pricing-plans/${planId}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        name: plan.name,
                        slug: plan.slug,
                        priceMonthlyCents: plan.priceMonthlyCents,
                        manualScanDailyLimit: daily ? Number(daily) : null,
                        manualScanCooldownMinutes: cooldown ? Number(cooldown) : 0
                    })
                });
                await hydratePlans();
                showStatus('Manual scan limits updated.');
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

            if (type === 'scan-repository') {
                await adminFetch(`/api/admin/repositories/${action.dataset.repositoryId}/scans`, { method: 'POST' });
                showStatus('Repository scan queued.');
            }

            if (type === 'deactivate-repository') {
                await adminFetch(`/api/admin/repositories/${action.dataset.repositoryId}`, { method: 'DELETE' });
                await hydrateRepositories(false);
                showStatus('Repository deactivated.');
            }

            if (type === 'run-all-scans') {
                await adminFetch('/api/admin/scans/run-all', { method: 'POST' });
                await hydrateScans(false);
                showStatus('All repository scans queued.');
            }

            if (type === 'retry-scan') {
                await adminFetch(`/api/admin/scans/${action.dataset.scanId}/retry`, { method: 'POST' });
                await hydrateScans(false);
                showStatus('Scan retry queued.');
            }

            if (type === 'update-admin') {
                const adminId = action.dataset.adminId;
                const name = document.querySelector(`[data-admin-name="${adminId}"]`).value;
                const role = document.querySelector(`[data-admin-role="${adminId}"]`).value;
                const status = document.querySelector(`[data-admin-status-field="${adminId}"]`).value;
                await adminFetch(`/api/admin/admins/${adminId}`, { method: 'PUT', body: JSON.stringify({ name, role, status }) });
                await hydrateAdmins();
                showStatus('Admin updated.');
            }
        } catch (error) {
            showStatus(error.message, true);
        }
    });

    hydrateCurrentPage();
})();
