(function () {
    const root = document.documentElement;
    const forcedTheme = document.body?.dataset.forceTheme;
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

    root.dataset.theme = forcedTheme || savedTheme || (prefersDark ? 'dark' : 'light');

    function toggleTheme() {
        root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', root.dataset.theme);
    }

    function toggleSidebar() {
        document.body.classList.toggle('sidebar-open');
    }

    function closeSidebar() {
        document.body.classList.remove('sidebar-open');
    }

    function closeLandingMenu() {
        document.body.classList.remove('landing-menu-open');
        document.querySelector('[data-landing-menu-toggle]')?.setAttribute('aria-expanded', 'false');
    }

    function getToken() {
        return localStorage.getItem('security_platform_token') || '';
    }

    function setToken(token) {
        if (token) {
            localStorage.setItem('security_platform_token', token);
        }
    }

    function getSafeNextPath() {
        const next = new URLSearchParams(window.location.search).get('next');

        if (!next || !next.startsWith('/') || next.startsWith('//')) {
            return '';
        }

        return next;
    }

    function getCookieConsent() {
        try {
            return JSON.parse(localStorage.getItem('securerepos_cookie_consent') || 'null');
        } catch (error) {
            return null;
        }
    }

    function saveCookieConsent(consent) {
        const payload = Object.assign(
            {
                necessary: true,
                preferences: false,
                analytics: false,
                marketing: false
            },
            consent,
            {
                necessary: true,
                updatedAt: new Date().toISOString()
            }
        );
        localStorage.setItem('securerepos_cookie_consent', JSON.stringify(payload));
        window.secureReposCookieConsent = payload;
        return payload;
    }

    async function apiFetch(path, options) {
        const token = getToken();
        const headers = Object.assign({ 'Content-Type': 'application/json' }, options && options.headers ? options.headers : {});

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(path, Object.assign({}, options, { headers }));
        const payload = await response.json().catch(function () {
            return {};
        });

        if (!response.ok) {
            throw new Error(payload.message || 'Request failed');
        }

        return payload;
    }

    document.addEventListener('click', function (event) {
        const themeButton = event.target.closest('[data-theme-toggle]');
        const sidebarButton = event.target.closest('[data-sidebar-toggle]');
        const overlay = event.target.closest('[data-sidebar-overlay]');
        const notificationButton = event.target.closest('[data-notification-toggle]');
        const providerButton = event.target.closest('[data-provider-connect]');
        const reportButton = event.target.closest('[data-report-export]');
        const landingMenuButton = event.target.closest('[data-landing-menu-toggle]');
        const landingMenu = event.target.closest('[data-landing-menu]');
        const landingMenuLink = event.target.closest('[data-landing-menu] a');
        const backToTopButton = event.target.closest('[data-back-to-top]');
        const cookieActionButton = event.target.closest('[data-cookie-action]');
        const panel = document.querySelector('[data-notification-panel]');

        if (themeButton) {
            toggleTheme();
        }

        if (sidebarButton) {
            toggleSidebar();
        }

        if (overlay) {
            closeSidebar();
        }

        if (notificationButton && panel) {
            panel.classList.toggle('open');
        } else if (panel && !event.target.closest('[data-notification-panel]')) {
            panel.classList.remove('open');
        }

        if (providerButton) {
            const provider = providerButton.dataset.providerConnect;
            connectProvider(providerButton, provider);
        }

        if (reportButton) {
            exportReport(reportButton);
        }

        if (landingMenuButton) {
            const isOpen = document.body.classList.toggle('landing-menu-open');
            landingMenuButton.setAttribute('aria-expanded', String(isOpen));
        } else if (landingMenuLink) {
            closeLandingMenu();
        } else if (!landingMenu && document.body.classList.contains('landing-menu-open')) {
            closeLandingMenu();
        }

        if (backToTopButton) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            closeLandingMenu();
        }

        if (cookieActionButton) {
            updateCookieConsent(cookieActionButton.dataset.cookieAction);
        }
    });

    const searchInput = document.querySelector('[data-command-search]');
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            closeLandingMenu();
        }

        if (!searchInput) {
            return;
        }

        const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
        if (isShortcut) {
            event.preventDefault();
            searchInput.focus();
        }
    });

    const backToTop = document.querySelector('[data-back-to-top]');
    function syncBackToTop() {
        if (!backToTop) {
            return;
        }

        backToTop.classList.toggle('visible', window.scrollY > 520);
    }

    syncBackToTop();
    window.addEventListener('scroll', syncBackToTop, { passive: true });

    const cookiePanel = document.querySelector('[data-cookie-consent]');
    function initCookieConsent() {
        if (!cookiePanel) {
            return;
        }

        const consent = getCookieConsent();
        if (consent) {
            window.secureReposCookieConsent = consent;
            return;
        }

        cookiePanel.hidden = false;
    }

    function updateCookieConsent(action) {
        if (!cookiePanel) {
            return;
        }

        const choices = {};
        cookiePanel.querySelectorAll('[data-cookie-choice]').forEach(function (input) {
            choices[input.dataset.cookieChoice] = action === 'all' ? true : action === 'necessary' ? false : Boolean(input.checked);
        });

        saveCookieConsent(choices);
        cookiePanel.hidden = true;
    }

    initCookieConsent();

    const notificationList = document.querySelector('[data-notification-list]');
    const unreadCount = document.querySelector('[data-unread-count]');

    if (notificationList && getToken()) {
        apiFetch('/api/user/notifications')
            .then(function (payload) {
                renderNotifications(payload.data || []);
            })
            .catch(function () {
                notificationList.dataset.state = 'offline';
            });
    }

    function renderNotifications(payload, prepend) {
        const items = Array.isArray(payload) ? payload : payload.notifications || [];
        if (!items.length) {
            return;
        }

        if (!prepend) {
            notificationList.innerHTML = '';
        }

        items.slice(0, 8).forEach(function (item) {
            const row = document.createElement('div');
            row.className = 'notification-item';
            row.innerHTML = '<strong></strong><span></span>';
            row.querySelector('strong').textContent = item.title || item.type || 'Security update';
            row.querySelector('span').textContent = item.message || item.body || 'A repository event needs review.';
            notificationList[prepend ? 'prepend' : 'append'](row);
        });

        if (unreadCount) {
            const current = Number(unreadCount.textContent || '0');
            unreadCount.textContent = String(prepend ? current + items.length : items.length);
        }
    }

    document.querySelectorAll('form[action="/api/auth/login"], form[action="/api/auth/signup"]').forEach(function (form) {
        form.addEventListener('submit', async function (event) {
            event.preventDefault();
            const button = form.querySelector('button[type="submit"]');
            const originalText = button ? button.textContent : '';

            if (button) {
                button.textContent = 'Please wait...';
                button.disabled = true;
            }

            try {
                const body = Object.fromEntries(new FormData(form).entries());
                const isOtpStep = form.dataset.otpStep === 'true';
                const payload = await apiFetch(isOtpStep ? '/api/auth/login/otp' : form.getAttribute('action'), { method: 'POST', body: JSON.stringify(body) });

                if (payload.data && payload.data.otpRequired) {
                    prepareOtpStep(form, payload.data.challengeId);
                    showFormStatus(form, 'Login code sent. Check your email.');
                    return;
                }

                setToken(payload.data && payload.data.token);
                window.location.href = getSafeNextPath() || (form.getAttribute('action') === '/api/auth/signup' ? '/onboarding' : '/dashboard');
            } catch (error) {
                showFormStatus(form, error.message, true);
            } finally {
                if (button) {
                    button.textContent = originalText;
                    button.disabled = false;
                }
            }
        });
    });

    function prepareOtpStep(form, challengeId) {
        form.dataset.otpStep = 'true';
        form.querySelectorAll('input[name="email"], input[name="password"]').forEach(function (input) {
            input.closest('.form-field')?.remove();
        });

        if (!form.querySelector('input[name="challengeId"]')) {
            const hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.name = 'challengeId';
            hidden.value = challengeId;
            form.prepend(hidden);
        }

        if (!form.querySelector('input[name="otpCode"]')) {
            const field = document.createElement('div');
            field.className = 'form-field';
            field.innerHTML = '<label>Login code</label><input class="input" type="text" name="otpCode" inputmode="numeric" autocomplete="one-time-code" required>';
            const status = form.querySelector('[data-form-status]');
            form.insertBefore(field, status || form.querySelector('button[type="submit"]'));
        }

        const button = form.querySelector('button[type="submit"]');
        if (button) {
            button.textContent = 'Verify code';
        }
    }

    document.querySelectorAll('[data-api-form]').forEach(function (form) {
        form.addEventListener('submit', async function (event) {
            event.preventDefault();
            const formType = form.dataset.apiForm;
            const body = Object.fromEntries(new FormData(form).entries());

            if (formType === 'notification-settings') {
                ['instantCritical', 'instantHigh', 'dailyDigest', 'weeklyReport'].forEach(function (key) {
                    body[key] = Boolean(form.querySelector(`[name="${key}"]`)?.checked);
                });
            }

            const map = {
                'invite-member': { path: '/api/user/team/invitations', method: 'POST' },
                'notification-settings': { path: '/api/user/settings/notifications', method: 'PUT' },
                'ignore-rule': { path: '/api/user/ignore-rules', method: 'POST' },
                'accept-invitation': { path: '/api/auth/invitations/accept', method: 'POST' },
                'cancel-subscription': { path: '/api/user/billing/cancel', method: 'POST' },
                'contact-message': { path: '/api/contact', method: 'POST' }
            };
            const target = map[formType];

            if (!target) {
                return;
            }

            try {
                const payload = await apiFetch(target.path, { method: target.method, body: JSON.stringify(body) });
                if (formType === 'accept-invitation') {
                    setToken(payload.data && payload.data.token);
                    window.location.href = '/onboarding';
                    return;
                }
                showFormStatus(form, formType === 'contact-message' ? 'Message sent. We will reply by email.' : 'Saved successfully.');
                form.reset();
            } catch (error) {
                showFormStatus(form, formType === 'contact-message' || getToken() ? error.message : 'Sign in first, then retry this action.', true);
            }
        });
    });

    hydratePageData();
    async function hydratePageData() {
        await Promise.allSettled([
            hydrateRepositories(),
            hydrateFindings(),
            hydrateTeamMembers(),
            hydrateNotificationsPage(),
            hydrateAuditLogs(),
            hydrateTrend(),
            hydrateProfile()
        ]);
    }

    function markApiSurfacesUnauthenticated() {
        document.querySelectorAll('[data-api-table], [data-api-list], [data-api-trend]').forEach(function (node) {
            node.dataset.state = 'demo';
        });
    }

    async function hydrateRepositories() {
        const table = document.querySelector('[data-api-table="repositories"]');
        if (!table) {
            return;
        }

        const payload = await apiFetch('/api/user/repositories');
        const rows = payload.data || [];
        if (!rows.length) {
            table.innerHTML = '<tr><td colspan="6">No repositories connected yet.</td></tr>';
            return;
        }

        table.innerHTML = rows.map(function (repo) {
            const score = repo.securityScore ?? repo.score ?? 0;
            const status = score >= 85 ? 'Healthy' : score >= 70 ? 'Review' : 'Critical';
            const badge = score >= 85 ? 'success' : score >= 70 ? 'warning' : 'danger';
            return `<tr><td><a href="/repositories/${repo.id}">${escapeHtml(repo.name || repo.fullName || 'Repository')}</a></td><td>${escapeHtml(repo.provider || repo.codeHostProvider || '-')}</td><td>${escapeHtml(repo.defaultBranch || 'main')}</td><td>${score}</td><td><span class="badge ${badge}">${status}</span></td><td><button class="button" type="button">Scan</button></td></tr>`;
        }).join('');
    }

    async function hydrateFindings() {
        const list = document.querySelector('[data-api-list="findings"]');
        if (!list) {
            return;
        }

        const payload = await apiFetch('/api/user/findings?status=open');
        const findings = payload.data || [];
        if (!findings.length) {
            list.innerHTML = '<div class="empty-state">No open findings. New scan results will appear here.</div>';
            return;
        }

        list.innerHTML = findings.map(function (finding) {
            const severity = String(finding.severity || 'medium');
            const badge = severity === 'critical' ? 'danger' : severity === 'high' ? 'warning' : 'brand';
            const repo = finding.repository?.name || finding.repositoryName || 'Repository';
            return `<article class="finding-item"><span class="badge ${badge}">${escapeHtml(severity)}</span><div><strong><a href="/findings/${finding.id}">${escapeHtml(finding.title || finding.ruleId || 'Finding')}</a></strong><p class="muted small">${escapeHtml(repo)} / ${escapeHtml(finding.filePath || '-')}</p></div><div class="row-actions"><button class="button" type="button">Assign</button><button class="button" type="button">Resolve</button></div></article>`;
        }).join('');
    }

    async function hydrateTeamMembers() {
        const table = document.querySelector('[data-api-table="team-members"]');
        if (!table) {
            return;
        }

        const payload = await apiFetch('/api/user/team/members');
        const members = payload.data || [];
        table.innerHTML = members.map(function (member) {
            return `<tr><td>${escapeHtml(member.name || '-')}</td><td>${escapeHtml(member.email || '-')}</td><td>${escapeHtml(member.role || 'member')}</td><td><span class="badge success">${escapeHtml(member.status || 'active')}</span></td><td>${formatDate(member.createdAt)}</td></tr>`;
        }).join('') || '<tr><td colspan="5">No team members found.</td></tr>';
    }

    async function hydrateNotificationsPage() {
        const list = document.querySelector('[data-api-list="notifications"]');
        if (!list) {
            return;
        }

        const payload = await apiFetch('/api/user/notifications');
        const notifications = payload.data || [];
        list.innerHTML = notifications.map(function (notification) {
            const read = notification.readAt ? 'success' : 'brand';
            return `<article class="finding-item"><span class="badge ${read}">${notification.readAt ? 'Read' : 'New'}</span><div><strong>${escapeHtml(notification.title || notification.type || 'Notification')}</strong><p class="muted small">${escapeHtml(notification.message || notification.body || '')}</p></div><button class="button" type="button">Mark read</button></article>`;
        }).join('') || '<div class="empty-state">No notifications yet.</div>';
    }

    async function hydrateAuditLogs() {
        const table = document.querySelector('[data-api-table="audit-logs"]');
        if (!table) {
            return;
        }

        const payload = await apiFetch('/api/user/audit-logs');
        const logs = payload.data || [];
        table.innerHTML = logs.map(function (log) {
            return `<tr><td>${escapeHtml(log.action || '-')}</td><td>${escapeHtml(log.entityType || '-')}</td><td>${formatDate(log.createdAt)}</td></tr>`;
        }).join('') || '<tr><td colspan="3">No audit events yet.</td></tr>';
    }

    async function hydrateTrend() {
        const trend = document.querySelector('[data-api-trend]');
        if (!trend) {
            return;
        }

        const payload = await apiFetch('/api/user/security-trend');
        const snapshots = (payload.data || []).slice(0, 8).reverse();
        if (!snapshots.length) {
            return;
        }

        trend.innerHTML = snapshots.map(function (snapshot) {
            const score = Math.max(8, Math.min(100, Number(snapshot.score || snapshot.securityScore || 50)));
            return `<span style="height:${score}%"></span>`;
        }).join('');
    }

    async function hydrateProfile() {
        const card = document.querySelector('[data-profile-card]');
        if (!card) {
            return;
        }

        const payload = await apiFetch('/api/user/me');
        const user = payload.data;
        if (!user) {
            return;
        }

        card.querySelector('.profile-avatar').textContent = String(user.name || user.email || 'U').charAt(0).toUpperCase();
        card.querySelector('strong').textContent = user.name || user.email;
        card.querySelector('p').textContent = `${user.email} · ${user.role}`;
    }

    async function connectProvider(button, provider) {
        const originalText = button.textContent;

        try {
            button.textContent = 'Opening...';
            const payload = await apiFetch(`/api/user/auth/${provider}/connect-url`);
            const url = payload.data?.url || payload.url;
            if (url) {
                window.location.href = url;
            }
        } catch (error) {
            button.textContent = getToken() ? 'Failed' : 'Sign in first';
            setTimeout(function () {
                button.textContent = originalText;
            }, 1600);
        }
    }

    async function exportReport(button) {
        const preview = document.querySelector('[data-report-preview]');
        const originalText = button.textContent;

        try {
            button.textContent = 'Exporting...';
            const payload = await apiFetch('/api/user/reports/export');
            if (preview) {
                preview.textContent = JSON.stringify(payload.data || payload, null, 2);
            }
        } catch (error) {
            if (preview) {
                preview.textContent = getToken() ? error.message : 'Sign in first, then export the report.';
            }
        } finally {
            button.textContent = originalText;
        }
    }

    function showFormStatus(form, message, isError) {
        const status = form.querySelector('[data-form-status]');
        if (status) {
            status.textContent = message;
            status.style.color = isError ? 'var(--danger)' : 'var(--success)';
        }
    }

    document.addEventListener('click', async function (event) {
        const logoutButton = event.target.closest('[data-logout]');
        if (!logoutButton) {
            return;
        }

        try {
            await apiFetch('/api/auth/logout', { method: 'POST' });
        } catch (error) {
            // Local token removal is still correct if the server session is already gone.
        }
        localStorage.removeItem('security_platform_token');
        window.location.href = '/sign-in';
    });

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, function (char) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char];
        });
    }

    function formatDate(value) {
        if (!value) {
            return '-';
        }

        return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }
})();
