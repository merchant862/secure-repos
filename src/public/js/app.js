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
        return document.querySelector('.app-shell') ? 'cookie-session' : '';
    }

    function setToken(token) {
        localStorage.removeItem('security_platform_token');
    }

    function getSafeNextPath() {
        const next = new URLSearchParams(window.location.search).get('next');
        const allowedPrefixes = [
            '/billing',
            '/checkout',
            '/dashboard',
            '/findings',
            '/notifications',
            '/onboarding',
            '/repositories',
            '/scans',
            '/settings'
        ];

        if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
            return '';
        }

        try {
            const parsed = new URL(next, window.location.origin);
            const isSameOrigin = parsed.origin === window.location.origin;
            const isAllowedPath = allowedPrefixes.some(function (prefix) {
                return parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`);
            });

            return isSameOrigin && isAllowedPath ? `${parsed.pathname}${parsed.search}` : '';
        } catch (error) {
            return '';
        }
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
        const headers = Object.assign({ 'Content-Type': 'application/json' }, options && options.headers ? options.headers : {});
        const response = await fetch(path, Object.assign({}, options, { headers, credentials: 'same-origin' }));
        const payload = await response.json().catch(function () {
            return {};
        });

        if (!response.ok) {
            throw new Error(payload.message || 'Request failed');
        }

        return payload;
    }

    document.addEventListener('click', function (event) {
        const disabledAction = event.target.closest('[aria-disabled="true"], .is-disabled');
        if (disabledAction) {
            event.preventDefault();
            return;
        }

        const themeButton = event.target.closest('[data-theme-toggle]');
        const sidebarButton = event.target.closest('[data-sidebar-toggle]');
        const overlay = event.target.closest('[data-sidebar-overlay]');
        const notificationButton = event.target.closest('[data-notification-toggle]');
        const mobileHeaderButton = event.target.closest('[data-mobile-header-toggle]');
        const mobileHeaderMenu = event.target.closest('[data-mobile-header-menu]');
        const providerButton = event.target.closest('[data-provider-connect]');
        const landingMenuButton = event.target.closest('[data-landing-menu-toggle]');
        const landingMenu = event.target.closest('[data-landing-menu]');
        const landingMenuLink = event.target.closest('[data-landing-menu] a');
        const backToTopButton = event.target.closest('[data-back-to-top]');
        const cookieActionButton = event.target.closest('[data-cookie-action]');
        const passwordToggle = event.target.closest('[data-password-toggle]');
        const billingChangePlanButton = event.target.closest('[data-billing-change-plan]');
        const billingPaymentMethodButton = event.target.closest('[data-billing-payment-method-update]');
        const cliTokenRevokeButton = event.target.closest('[data-cli-token-revoke]');
        const cliTokenCopyButton = event.target.closest('[data-cli-token-copy]');
        const cliTokenModalClose = event.target.closest('[data-cli-token-modal-close]');
        const scanButton = event.target.closest('[data-repository-scan]');
        const repositoryFilterButton = event.target.closest('[data-repository-filter]');
        const repositoryPageButton = event.target.closest('[data-repository-page]');
        const scanPageButton = event.target.closest('[data-scan-page]');
        const loadMoreButton = event.target.closest('[data-load-more]');
        const markReadButton = event.target.closest('[data-notification-read]');
        const mitigationButton = event.target.closest('[data-mitigation-open]');
        const mitigationCloseButton = event.target.closest('[data-mitigation-close]');
        const mitigationResolveButton = event.target.closest('[data-mitigation-resolve]');
        const findingResolveButton = event.target.closest('[data-finding-resolve]');
        const panel = document.querySelector('[data-notification-panel]');
        const mobileHeaderMenuPanel = document.querySelector('[data-mobile-header-menu]');

        if (themeButton) {
            toggleTheme();
        }

        if (mobileHeaderButton && mobileHeaderMenuPanel) {
            const isOpen = mobileHeaderMenuPanel.classList.toggle('open');
            mobileHeaderButton.setAttribute('aria-expanded', String(isOpen));
        } else if (mobileHeaderMenuPanel && !mobileHeaderMenu && !event.target.closest('[data-mobile-header-toggle]')) {
            mobileHeaderMenuPanel.classList.remove('open');
            document.querySelector('[data-mobile-header-toggle]')?.setAttribute('aria-expanded', 'false');
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

        if (providerButton && !providerButton.disabled) {
            event.preventDefault();
            const provider = providerButton.dataset.providerConnect;
            connectProvider(providerButton, provider);
        }

        if (scanButton) {
            queueRepositoryScan(scanButton);
        }

        if (repositoryFilterButton) {
            setRepositoryFilter(repositoryFilterButton);
        }

        if (repositoryPageButton) {
            changeRepositoryPage(repositoryPageButton);
        }

        if (scanPageButton) {
            changeScanPage(scanPageButton);
        }

        if (loadMoreButton) {
            loadMore(loadMoreButton.dataset.loadMore, loadMoreButton);
        }

        if (markReadButton) {
            markNotificationRead(markReadButton);
        }

        if (mitigationButton) {
            openMitigationPanel(mitigationButton);
        }

        if (mitigationCloseButton) {
            closeMitigationPanel();
        }

        if (mitigationResolveButton) {
            resolveFinding(mitigationResolveButton);
        }

        if (findingResolveButton) {
            resolveFindingInline(findingResolveButton);
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

        if (passwordToggle) {
            const field = passwordToggle.closest('.password-field');
            const input = field?.querySelector('input');
            if (input) {
                const isHidden = input.type === 'password';
                input.type = isHidden ? 'text' : 'password';
                passwordToggle.textContent = isHidden ? 'Hide' : 'Show';
            }
        }

        if (billingChangePlanButton) {
            openPlanChangeModal(billingChangePlanButton);
        }

        if (billingPaymentMethodButton) {
            updatePaymentMethod(billingPaymentMethodButton);
        }

        if (cliTokenRevokeButton) {
            showCliTokenRevokeConfirmation(cliTokenRevokeButton);
        }

        if (cliTokenCopyButton) {
            copyCliToken(cliTokenCopyButton);
        }

        if (cliTokenModalClose) {
            cliTokenModalClose.closest('[data-cli-token-modal]')?.remove();
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

    const githubCallbackStatus = document.querySelector('[data-github-callback-status]');
    if (githubCallbackStatus) {
        const params = new URLSearchParams(window.location.search);
        const githubStatus = params.get('github');

        if (githubStatus) {
            const repositories = params.get('repositories');
            const message = params.get('message');
            const statusMessages = {
                connected: `GitHub App connected. ${repositories || '0'} repositories synced.`,
                installed: 'GitHub App installation received. Open GitHub setup from this workspace if repositories do not appear.',
                error: `GitHub App could not be connected${message ? `: ${message}` : '.'}`,
                'missing-installation': 'GitHub did not return an installation id. Please try installing the app again.',
                cancelled: 'GitHub setup was not completed. You can install the app again whenever you are ready.'
            };

            githubCallbackStatus.hidden = false;
            githubCallbackStatus.innerHTML = `<span class="badge ${githubStatus === 'error' || githubStatus === 'missing-installation' ? 'danger' : githubStatus === 'cancelled' ? 'warning' : 'success'}">${githubStatus === 'connected' ? 'Connected' : 'GitHub'}</span><p class="muted" style="margin:10px 0 0">${escapeHtml(statusMessages[githubStatus] || 'GitHub setup status received.')}</p>`;
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    const notificationList = document.querySelector('[data-notification-list]');
    const unreadCount = document.querySelector('[data-unread-count]');
    const pageState = {
        notifications: { cursor: null, hasMore: false },
        scans: { cursor: null, previousCursors: [], nextCursor: null, page: 1, total: 0 },
        repositories: { cursor: null, previousCursors: [], nextCursor: null, filter: 'all', page: 1, total: 0 }
    };
    let mePayloadPromise = null;

    if (notificationList && getToken()) {
        apiFetch('/api/user/notifications')
            .then(function (payload) {
                renderNotifications(payload.data || []);
                pageState.notifications.cursor = payload.pagination?.nextCursor || null;
            })
            .catch(function () {
                notificationList.dataset.state = 'offline';
            });
    }

    function renderNotifications(payload, prepend) {
        const items = Array.isArray(payload) ? payload : payload.notifications || [];
        if (!notificationList) {
            return;
        }

        if (!prepend) {
            notificationList.innerHTML = '';
        }

        if (!items.length) {
            if (!prepend) {
                notificationList.innerHTML = '<div class="notification-item"><strong>No notifications</strong><span>Scan and workspace events will appear here.</span></div>';
            }
            if (unreadCount && !prepend) {
                unreadCount.textContent = '0';
            }
            return;
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
            const unreadItems = items.filter((item) => !item.readAt).length;
            unreadCount.textContent = String(prepend ? current + unreadItems : unreadItems);
        }
    }

    if (getToken() && window.EventSource) {
        try {
            const events = new EventSource('/api/user/notifications/stream');
            events.addEventListener('notifications.snapshot', function (event) {
                const payload = JSON.parse(event.data || '{}');
                if (unreadCount) {
                    unreadCount.textContent = String(payload.unreadCount || 0);
                }
                if (payload.latest) {
                    renderNotifications(payload.latest);
                }
            });
            events.addEventListener('notifications.created', function (event) {
                const payload = JSON.parse(event.data || '{}');
                if (payload.notification) {
                    renderNotifications([payload.notification], true);
                }
            });
        } catch (error) {
            // Regular polling still loads notifications if SSE is unavailable.
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
                const payload = await apiFetch(form.getAttribute('action'), { method: 'POST', body: JSON.stringify(body) });

                if (payload.data && payload.data.otpRequired) {
                    showLoginOtpPendingModal();
                    showFormStatus(form, 'Login code sent. Check your email.');
                    setTimeout(function () {
                        openLoginOtpModal(form, payload.data.challengeId, payload.data.expiresAt);
                    }, 2200);
                    return;
                }

                setToken(payload.data && payload.data.token);
                const signupTarget = payload.data?.checkoutLinkSent ? '/onboarding?signup=check-email' : '/onboarding';
                window.location.href = getSafeNextPath() || (form.getAttribute('action') === '/api/auth/signup' ? signupTarget : '/dashboard');
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

    function closeLoginOtpModal() {
        document.querySelector('[data-login-otp-modal]')?.remove();
    }

    function showLoginOtpPendingModal() {
        closeLoginOtpModal();

        const modal = document.createElement('div');
        modal.className = 'auth-modal-backdrop';
        modal.dataset.loginOtpModal = 'true';
        modal.innerHTML = `<div class="auth-modal auth-modal-pending" role="dialog" aria-modal="true" aria-live="polite">
            <span class="badge brand">Email verification</span>
            <h2>Sending your login code</h2>
            <p class="muted">We are preparing a one-time code for this sign-in attempt.</p>
            <div class="typing-dots" aria-hidden="true"><span></span><span></span><span></span></div>
        </div>`;

        document.body.appendChild(modal);
    }

    function openLoginOtpModal(loginForm, challengeId, expiresAt) {
        closeLoginOtpModal();

        const modal = document.createElement('div');
        modal.className = 'auth-modal-backdrop';
        modal.dataset.loginOtpModal = 'true';
        modal.innerHTML = `<div class="auth-modal" role="dialog" aria-modal="true" aria-labelledby="login-otp-title">
            <button class="icon-button auth-modal-close" type="button" data-login-otp-close aria-label="Close">x</button>
            <span class="badge brand">Email verification</span>
            <h2 id="login-otp-title">Enter your login code</h2>
            <p class="muted">We sent a 6-digit code to your email. This extra check is required on every login.</p>
            <form data-login-otp-form>
                <input type="hidden" name="challengeId" value="${escapeHtml(challengeId)}">
                <div class="form-field">
                    <label>One-time code</label>
                    <input class="input otp-input" type="text" name="otpCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required autofocus>
                </div>
                <button class="button primary" type="submit" style="width:100%">Verify and continue</button>
                <p class="muted small" data-form-status style="margin:12px 0 0">${expiresAt ? `Code expires at ${escapeHtml(formatDateTime(expiresAt))}.` : ''}</p>
            </form>
        </div>`;

        document.body.appendChild(modal);
        modal.querySelector('[name="otpCode"]')?.focus();

        modal.addEventListener('click', function (event) {
            if (event.target === modal || event.target.closest('[data-login-otp-close]')) {
                closeLoginOtpModal();
            }
        });

        modal.querySelector('[data-login-otp-form]')?.addEventListener('submit', async function (event) {
            event.preventDefault();
            const form = event.currentTarget;
            const button = form.querySelector('button[type="submit"]');
            const status = form.querySelector('[data-form-status]');
            const originalText = button ? button.textContent : '';

            if (button) {
                button.disabled = true;
                button.textContent = 'Verifying...';
            }

            try {
                const body = Object.fromEntries(new FormData(form).entries());
                await apiFetch('/api/auth/login/otp', { method: 'POST', body: JSON.stringify(body) });
                window.location.href = getSafeNextPath() || '/dashboard';
            } catch (error) {
                if (status) {
                    status.textContent = error.message || 'Invalid or expired login code';
                    status.style.color = 'var(--danger)';
                }
            } finally {
                if (button) {
                    button.disabled = false;
                    button.textContent = originalText;
                }
            }
        });
    }

    document.querySelectorAll('[data-auth-flow="password-reset-request"], [data-auth-flow="password-reset-confirm"]').forEach(function (form) {
        form.addEventListener('submit', async function (event) {
            event.preventDefault();
            const button = form.querySelector('button[type="submit"]');
            const originalText = button ? button.textContent : '';

            if (button) {
                button.disabled = true;
                button.textContent = 'Please wait...';
            }

            try {
                const body = Object.fromEntries(new FormData(form).entries());
                const payload = await apiFetch(form.getAttribute('action'), { method: 'POST', body: JSON.stringify(body) });
                showFormStatus(form, payload.message || 'Done.');

                if (form.dataset.authFlow === 'password-reset-confirm') {
                    setTimeout(function () {
                        window.location.href = '/sign-in?reset=success';
                    }, 1200);
                }
            } catch (error) {
                showFormStatus(form, error.message, true);
            } finally {
                if (button) {
                    button.disabled = false;
                    button.textContent = originalText;
                }
            }
        });
    });

    document.querySelector('[data-findings-status-filter]')?.addEventListener('change', function () {
        hydrateFindings();
    });

    document.querySelectorAll('[data-api-form]').forEach(function (form) {
        form.addEventListener('submit', async function (event) {
            event.preventDefault();
            const formType = form.dataset.apiForm;
            const body = Object.fromEntries(new FormData(form).entries());

            const map = {
                'password-change': { path: '/api/user/auth/password', method: 'PUT' },
                'cancel-subscription': { path: '/api/user/billing/cancel', method: 'POST' },
                'contact-message': { path: '/api/contact', method: 'POST' }
            };
            const target = map[formType];

            if (!target) {
                return;
            }

            try {
                if (formType === 'password-change' && body.newPassword !== body.confirmPassword) {
                    throw new Error('New password and confirmation do not match.');
                }

                const payload = await apiFetch(target.path, { method: target.method, body: JSON.stringify(body) });
                showFormStatus(form, formType === 'contact-message' ? 'Message sent. We will reply by email.' : payload.message || 'Saved successfully.');
                if (formType === 'cancel-subscription') {
                    await hydrateBilling();
                    await hydrateOnboarding();
                }
                form.reset();
            } catch (error) {
                showFormStatus(form, formType === 'contact-message' || getToken() ? error.message : 'Sign in first, then retry this action.', true);
            }
        });
    });

    document.querySelector('[data-cli-token-form]')?.addEventListener('submit', async function (event) {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector('button[type="submit"]');
        const status = form.querySelector('[data-cli-token-status]');
        const originalText = button.textContent;

        button.disabled = true;
        button.textContent = 'Generating...';
        if (status) status.textContent = '';

        try {
            const body = Object.fromEntries(new FormData(form).entries());
            const payload = await apiFetch('/api/user/cli-tokens', {
                method: 'POST',
                body: JSON.stringify(body)
            });
            form.reset();
            showCliTokenSecret(payload.data?.token, payload.data?.accessToken);
            await hydrateCliTokens();
        } catch (error) {
            if (status) {
                status.textContent = error.message || 'CLI token could not be created.';
                status.style.color = 'var(--danger)';
            }
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    });

    hydratePageData();
    async function hydratePageData() {
        await Promise.allSettled([
            hydrateDashboard(),
            hydrateRepositories(),
            hydrateScans(false),
            hydrateScanDetail(),
            hydrateRepositoryDetail(),
            hydrateFindings(),
            hydrateNotificationsPage(),
            hydrateAuditLogs(),
            hydrateCliTokens(),
            hydrateTrend(),
            hydrateSessionSummary(),
            hydrateBilling(),
            hydrateOnboarding(),
            hydratePublicPricing(),
            hydratePaddleCheckout()
        ]);
    }

    function parseJsonScript(selector) {
        const script = document.querySelector(selector);
        if (!script) {
            return null;
        }

        try {
            return JSON.parse(script.textContent || '{}');
        } catch (error) {
            return null;
        }
    }

    function showCheckoutError(message) {
        const frame = document.querySelector('[data-paddle-frame]');
        if (!frame) {
            return;
        }

        frame.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
    }

    async function hydratePaddleCheckout() {
        const checkoutNode = document.querySelector('[data-paddle-checkout]');
        if (!checkoutNode) {
            return;
        }

        const config = parseJsonScript('[data-paddle-config]');

        if (!config || !config.clientToken || !config.priceId) {
            showCheckoutError('Checkout is not configured yet.');
            return;
        }

        if (!window.Paddle) {
            showCheckoutError('Paddle checkout could not be loaded. Please refresh the page.');
            return;
        }

        let hasSyncedCheckout = false;
        const syncPaddleCheckout = async function (event) {
            const eventName = String(event?.name || event?.type || event?.eventName || '');
            if (hasSyncedCheckout || !/(checkout|transaction|subscription).*(completed|created|updated)|completed/i.test(eventName)) {
                return;
            }

            hasSyncedCheckout = true;

            try {
                await apiFetch('/api/user/billing/paddle-sync', { method: 'POST', body: JSON.stringify(event || {}) });
                window.location.assign(config.successUrl || '/onboarding?checkout=success');
            } catch (error) {
                hasSyncedCheckout = false;
                console.warn('Paddle checkout sync failed:', error.message || error);
            }
        };

        try {
            if (config.environment === 'sandbox' && window.Paddle.Environment) {
                window.Paddle.Environment.set('sandbox');
            }

            window.Paddle.Initialize({ token: config.clientToken, eventCallback: syncPaddleCheckout });
            window.Paddle.Checkout.open({
                settings: {
                    displayMode: 'inline',
                    frameTarget: 'paddle-checkout-frame',
                    frameInitialHeight: 460,
                    frameStyle: 'width:100%; min-width:312px; background-color: transparent; border: none;',
                    successUrl: config.successUrl
                },
                items: [
                    {
                        priceId: config.priceId,
                        quantity: 1
                    }
                ],
                customer: config.customer || undefined,
                customData: config.customData || undefined
            });
        } catch (error) {
            showCheckoutError(error.message || 'Checkout could not be started.');
        }
    }

    async function hydratePublicPricing() {
        const container = document.querySelector('[data-public-pricing]');
        if (!container) {
            return;
        }

        try {
            const payload = await apiFetch('/api/pricing');
            const plans = payload.data || [];

            container.innerHTML = plans.map(function (plan) {
                const price = new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: plan.currency || 'USD',
                    minimumFractionDigits: 2
                }).format(Number(plan.priceMonthlyCents || 0) / 100);
                const features = (plan.features || []).filter((feature) => feature.isIncluded !== false);
                const cardClass = plan.isHighlighted ? 'card card-body plan-card plan-featured' : 'card card-body plan-card';
                const badgeClass = plan.isHighlighted ? 'badge success' : 'badge brand';
                const badgeText = plan.isHighlighted ? 'Recommended' : plan.name;
                const buttonClass = plan.isHighlighted ? 'button primary' : 'button';
                const checkoutToken = plan.checkoutToken || '';
                const target = checkoutToken
                    ? (container.dataset.pricingTarget === 'billing'
                        ? `/checkout?t=${encodeURIComponent(checkoutToken)}`
                        : `/sign-up?t=${encodeURIComponent(checkoutToken)}`)
                    : '/contact';

                return `<article class="${cardClass}">
                    <span class="${badgeClass}">${escapeHtml(badgeText)}</span>
                    <h3>${escapeHtml(plan.name)}</h3>
                    <div class="metric-value">${escapeHtml(price)}<span class="plan-period">/mo</span></div>
                    <p class="muted small">${escapeHtml(plan.description || '')}</p>
                    <ul class="plan-list">${features.map((feature) => `<li>${escapeHtml(feature.label)}</li>`).join('')}</ul>
                    <a class="${buttonClass}" href="${target}">${escapeHtml(plan.ctaLabel || `Choose ${plan.name}`)}</a>
                </article>`;
            }).join('') || '<div class="empty-state">Plans are currently unavailable. Please contact support.</div>';
        } catch (error) {
            container.innerHTML = '<div class="empty-state">Pricing could not be loaded. Please refresh or contact support.</div>';
        }
    }

    function markApiSurfacesUnauthenticated() {
        document.querySelectorAll('[data-api-table], [data-api-list], [data-api-trend]').forEach(function (node) {
            node.dataset.state = 'demo';
        });
    }

    async function hydrateDashboard() {
        const metricNodes = document.querySelectorAll('[data-dashboard-metric]');
        if (!metricNodes.length) {
            return;
        }

        const payload = await apiFetch('/api/user/dashboard-summary');
        const data = payload.data || {};
        const metrics = data.metrics || {};

        metricNodes.forEach(function (node) {
            const key = node.dataset.dashboardMetric;
            node.textContent = key === 'averageScore' ? `${metrics[key] ?? 0}` : String(metrics[key] ?? 0);
        });

        const risk = document.querySelector('[data-dashboard-risk]');
        if (risk) {
            const counts = data.severityCounts || {};
            const total = ['critical', 'high', 'medium', 'low'].reduce((sum, key) => sum + Number(counts[key] || 0), 0);
            risk.innerHTML = total
                ? `<div class="grid grid-4">${['critical', 'high', 'medium', 'low'].map(function (key) {
                    const badge = key === 'critical' ? 'danger' : key === 'high' ? 'warning' : key === 'medium' ? 'brand' : 'success';
                    return `<article class="card card-body" style="background:var(--surface-muted)"><span class="badge ${badge}">${escapeHtml(key)}</span><div class="metric-value">${escapeHtml(counts[key] || 0)}</div></article>`;
                }).join('')}</div>`
                : '<div class="empty-state">Run a repository scan to build your risk overview.</div>';
        }

        const health = document.querySelector('[data-dashboard-github-health]');
        if (health) {
            health.textContent = metrics.repositories > 0
                ? `${metrics.repositories} repositories connected. Latest scan activity and findings are loading from your workspace.`
                : 'Install the GitHub App and select repositories to start sync and scanning.';
        }

        const githubConnection = data.githubConnection;
        const account = document.querySelector('[data-dashboard-github-account]');
        if (account && githubConnection) {
            account.hidden = false;
            document.querySelector('[data-dashboard-github-login]').textContent = githubConnection.accountLogin || 'GitHub connected';
            document.querySelector('[data-dashboard-github-link]').href = githubConnection.accountLogin ? `https://github.com/${encodeURIComponent(githubConnection.accountLogin)}` : 'https://github.com';
            document.querySelector('[data-dashboard-github-meta]').textContent = `${githubConnection.accountType || 'Account'} · last sync ${formatDate(githubConnection.lastSyncAt || githubConnection.updatedAt)}`;
        }

        const latestFindingsTable = document.querySelector('[data-api-table="latest-findings"]');
        if (latestFindingsTable) {
            const findings = data.recentFindings || [];
            latestFindingsTable.innerHTML = findings.map(renderFindingRow).join('') || '<tr><td colspan="3">No open findings yet.</td></tr>';
        }

        const dashboardRepositoriesTable = document.querySelector('[data-dashboard-repositories]');
        if (dashboardRepositoriesTable) {
            const repositories = data.dashboardRepositories || [];
            dashboardRepositoriesTable.innerHTML = repositories.map(renderRepositoryRow).join('') || '<tr><td colspan="6">No repository activity yet.</td></tr>';
        }
    }

    function formatMoney(cents, currency) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency || 'USD',
            minimumFractionDigits: 2
        }).format(Number(cents || 0) / 100);
    }

    function includedPlanFeatures(plan) {
        return (plan?.features || [])
            .filter((feature) => feature && feature.isIncluded !== false)
            .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
    }

    function planRepositoryLimitCopy(plan) {
        if (!plan) {
            return 'No repository limit loaded';
        }

        return plan.repositoryLimit === null || plan.repositoryLimit === undefined
            ? 'Unlimited repositories'
            : `${plan.repositoryLimit} repositories`;
    }

    function planScheduleCopy(plan) {
        const schedule = String(plan?.scanSchedule || '').replace(/_/g, ' ');
        return schedule ? schedule : 'Manual scans';
    }

    function renderPlanDetailBlock(plan, options) {
        if (!plan) {
            return '<p class="muted">No package is selected yet.</p>';
        }

        const price = `${formatMoney(plan.priceMonthlyCents, plan.currency)}<span class="plan-period">/mo</span>`;
        const features = includedPlanFeatures(plan);
        const periodEnd = options?.periodEnd ? `<p class="muted small">${escapeHtml(options.periodEnd)}</p>` : '';
        const pendingCopy = options?.pendingCopy ? `<p class="muted small">${escapeHtml(options.pendingCopy)}</p>` : '';
        const statusNote = options?.statusNote ? `<p class="muted small">${escapeHtml(options.statusNote)}</p>` : '';
        const featureList = features.length
            ? `<ul class="plan-list compact">${features.map((feature) => `<li>${escapeHtml(feature.label)}</li>`).join('')}</ul>`
            : '<p class="muted small">Package features will appear here when configured.</p>';

        return `<div class="billing-plan-summary">
            <div class="metric-value">${price}</div>
            <p class="muted">${escapeHtml(plan.description || 'Repository security scanning package.')}</p>
            <div class="plan-detail-grid">
                <span><strong>${escapeHtml(planRepositoryLimitCopy(plan))}</strong><small>Repository coverage</small></span>
                <span><strong>${escapeHtml(planScheduleCopy(plan))}</strong><small>Scan schedule</small></span>
                <span><strong>${escapeHtml(`${plan.findingHistoryDays ?? 30} days`)}</strong><small>Finding history</small></span>
            </div>
            ${featureList}
            ${periodEnd}
            ${pendingCopy}
            ${statusNote}
        </div>`;
    }

    function subscriptionState(subscription) {
        const status = String(subscription?.status || 'pending');
        return {
            status,
            isActive: status === 'active',
            isCancelled: status === 'cancelled',
            isPastDue: status === 'past_due',
            isPending: status === 'pending'
        };
    }

    async function hydrateBilling() {
        const badge = document.querySelector('[data-billing-status-badge]');
        if (!badge) {
            return;
        }

        let payload = await apiFetch('/api/user/billing');
        let subscription = payload.data?.subscription;

        if (
            subscription
            && String(subscription.status || 'pending') === 'pending'
            && !subscription.providerSubscriptionId
            && !subscription.provider
            && !window.__paddleBillingRecovered
        ) {
            window.__paddleBillingRecovered = true;

            try {
                await apiFetch('/api/user/billing/paddle-sync', { method: 'POST', body: JSON.stringify({ recoverByEmail: true }) });
                payload = await apiFetch('/api/user/billing');
                subscription = payload.data?.subscription;
            } catch (error) {
                // Keep the normal pending checkout state if Paddle cannot verify this workspace yet.
            }
        }

        const plan = subscription?.pricingPlan || payload.data?.selectedPlan;
        const pendingPlan = payload.data?.pendingPlan;
        const checkoutToken = payload.data?.checkoutToken || '';
        const paymentMethod = payload.data?.paymentMethod;
        const paymentMethodError = payload.data?.paymentMethodError;
        const state = subscriptionState(subscription);
        const statusLabel = state.isActive ? 'Active' : state.isCancelled ? 'Cancelled' : state.isPastDue ? 'Payment issue' : 'Pending';
        const statusClass = state.isActive ? 'success' : state.isCancelled ? 'danger' : state.isPastDue ? 'warning' : 'brand';
        const checkoutLabel = state.isActive ? 'Complete' : state.isCancelled ? 'Cancelled' : state.isPastDue ? 'Needs attention' : plan ? 'Checkout needed' : 'Plan needed';
        const checkoutClass = state.isActive ? 'success' : state.isCancelled ? 'danger' : state.isPastDue ? 'warning' : 'brand';
        const planName = plan?.name || (subscription?.pricingPlanId ? `Plan #${subscription.pricingPlanId}` : 'No selected plan');
        const periodEnd = subscription?.currentPeriodEndsAt ? `Renews/ends ${formatDate(subscription.currentPeriodEndsAt)}.` : '';
        const pendingCopy = pendingPlan ? `Scheduled change: ${pendingPlan.name} on ${subscription?.pendingPlanChangeEffectiveAt ? formatDate(subscription.pendingPlanChangeEffectiveAt) : 'the next billing period'}.` : '';
        const provider = subscription?.provider === 'paddle' ? 'Paddle' : 'Checkout provider';
        const setText = (selector, text) => {
            const node = document.querySelector(selector);
            if (node) node.textContent = text;
        };
        const setBadge = (selector, text, className) => {
            const node = document.querySelector(selector);
            if (!node) return;
            node.textContent = text;
            node.className = `badge ${className}`;
        };

        badge.textContent = statusLabel;
        badge.className = `badge ${statusClass}`;
        setBadge('[data-billing-checkout-badge]', checkoutLabel, checkoutClass);
        setText('[data-billing-toolbar-copy]', state.isActive
            ? 'Your subscription is active. GitHub repository scanning is available for this workspace.'
            : state.isCancelled
                ? 'This subscription is cancelled. Choose a plan again to reactivate scanning.'
                : plan
                    ? `${plan.name} is selected. Complete checkout to activate repository scanning.`
                    : 'Choose a plan and complete checkout to activate repository scanning for this workspace.');
        setText('[data-billing-plan-name]', planName);
        const planDetails = document.querySelector('[data-billing-plan-details]');
        if (planDetails) {
            planDetails.innerHTML = renderPlanDetailBlock(plan, { periodEnd, pendingCopy });
        }
        setText('[data-billing-provider-copy]', subscription?.providerSubscriptionId
            ? `${provider} subscription ${subscription.providerSubscriptionId} is linked to this workspace.`
            : state.isActive
                ? 'Subscription is active. Provider details will appear when Paddle sends them.'
                : plan
                    ? `Checkout is ready for ${plan.name}. Paddle will link payment details after confirmation.`
                    : 'Checkout will link the payment provider subscription to this workspace.');
        setBadge('[data-billing-step-plan-badge]', plan ? 'Done' : 'Next', plan ? 'success' : 'brand');
        setText('[data-billing-step-plan]', plan ? `${plan.name} is selected for this workspace.` : 'Choose a package before checkout.');
        setBadge('[data-billing-step-payment-badge]', state.isActive ? 'Done' : state.isCancelled ? 'Cancelled' : state.isPastDue ? 'Issue' : 'Next', statusClass);
        setText('[data-billing-step-payment]', state.isActive ? 'Payment is confirmed and access is active.' : state.isCancelled ? 'Future renewal has been cancelled.' : state.isPastDue ? 'Payment needs attention in Paddle.' : plan ? 'Complete Paddle checkout to activate scans.' : 'Choose a plan to unlock checkout.');

        const checkoutAction = document.querySelector('[data-billing-checkout-action]');
        if (checkoutAction) {
            checkoutAction.textContent = state.isActive ? 'Open onboarding' : state.isCancelled ? 'Choose plan again' : plan ? 'Continue checkout' : 'Choose plan';
            checkoutAction.href = state.isActive
                ? '/onboarding'
                : checkoutToken
                    ? `/checkout?t=${encodeURIComponent(checkoutToken)}`
                    : '/checkout';
        }

        const cancelButton = document.querySelector('[data-billing-cancel-button]');
        if (cancelButton) {
            cancelButton.disabled = !state.isActive || !subscription?.providerSubscriptionId;
            cancelButton.textContent = state.isCancelled ? 'Subscription cancelled' : 'Cancel subscription';
        }
        const paymentMethodButton = document.querySelector('[data-billing-payment-method-update]');
        const paymentMethodCopy = document.querySelector('[data-billing-payment-method-copy]');
        if (paymentMethodButton) {
            paymentMethodButton.disabled = !['active', 'past_due'].includes(state.status) || subscription?.provider !== 'paddle' || !subscription?.providerSubscriptionId;
        }
        if (paymentMethodCopy) {
            if (paymentMethod?.last4) {
                const brand = paymentMethod.brand ? `${paymentMethod.brand} ` : '';
                const expiry = paymentMethod.expiryMonth && paymentMethod.expiryYear ? ` · expires ${paymentMethod.expiryMonth}/${paymentMethod.expiryYear}` : '';
                paymentMethodCopy.textContent = `${brand}ending in ${paymentMethod.last4}${expiry}. Updates happen securely on Paddle.`;
            } else if (paymentMethodError) {
                paymentMethodCopy.textContent = 'Payment method is linked in Paddle, but details could not be loaded right now.';
            } else if (subscription?.provider === 'paddle' && subscription.providerSubscriptionId) {
                paymentMethodCopy.textContent = 'Payment method is managed by Paddle. Open Paddle to update it.';
            } else {
                paymentMethodCopy.textContent = 'Payment method details load after checkout is confirmed.';
            }
        }
        setText('[data-billing-cancel-copy]', state.isActive
            ? pendingPlan
                ? 'A plan change is already scheduled. Another plan change is blocked until the next billing cycle.'
                : 'Cancel future renewals from this page. Access remains subject to the current billing period and Paddle status.'
            : state.isCancelled
                ? 'This subscription has already been cancelled.'
                : 'Cancellation becomes available after checkout is confirmed.');
    }

    async function updatePaymentMethod(button) {
        const originalText = button.textContent;

        try {
            button.disabled = true;
            button.textContent = 'Opening Paddle...';
            const payload = await apiFetch('/api/user/billing/payment-method/update-link', { method: 'POST', body: JSON.stringify({}) });
            const url = payload.data?.url || payload.url;

            if (!url) {
                throw new Error('Payment method update link was not returned.');
            }

            window.location.href = url;
        } catch (error) {
            button.textContent = 'Try later';
            button.title = error.message;
            setTimeout(function () {
                button.disabled = false;
                button.textContent = originalText;
            }, 2200);
        }
    }

    function closePlanChangeModal() {
        document.querySelector('[data-plan-change-modal]')?.remove();
    }

    function planById(plans, id) {
        return plans.find((plan) => Number(plan.id) === Number(id));
    }

    function activeRepositoryIds(repositories) {
        return repositories.filter((repository) => repository.isActive).map((repository) => Number(repository.id));
    }

    function updatePlanChangeSummary(modal, options) {
        const selectedPlanId = Number(modal.querySelector('input[name="pricingPlanId"]:checked')?.value);
        const plan = planById(options.plans, selectedPlanId);
        const selectedRepositoryIds = Array.from(modal.querySelectorAll('input[name="repositoryIds"]:checked')).map((input) => Number(input.value));
        const limit = plan?.repositoryLimit ?? null;
        const count = selectedRepositoryIds.length;
        const summary = modal.querySelector('[data-plan-change-summary]');
        const submit = modal.querySelector('[data-plan-change-submit]');

        if (!summary || !submit) {
            return;
        }

        if (!plan) {
            summary.textContent = 'Choose a plan to continue.';
            submit.disabled = true;
            return;
        }

        const limitCopy = limit === null || limit === undefined ? 'unlimited repositories' : `${limit} active repositories`;
        const overLimit = limit !== null && limit !== undefined && count > limit;
        const noRepos = count === 0 && limit !== 0;

        summary.textContent = overLimit
            ? `${plan.name} allows ${limitCopy}. Uncheck ${count - Number(limit)} repositories.`
            : noRepos
                ? `Select at least one repository for ${plan.name}.`
                : `${plan.name} will keep ${count} repositories active (${limitCopy}).`;
        submit.disabled = overLimit || noRepos || Number(options.subscription?.pricingPlanId) === selectedPlanId;
    }

    async function openPlanChangeModal(button) {
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = 'Loading...';

        try {
            const payload = await apiFetch('/api/user/billing/plan-change-options');
            const options = payload.data || {};
            const subscription = options.subscription || {};
            const plans = options.plans || [];
            const repositories = options.repositories || [];
            const currentPlanId = Number(subscription.pricingPlanId);
            const pendingPlan = subscription.pendingPricingPlanId ? planById(plans, subscription.pendingPricingPlanId) : null;
            const currentActiveIds = activeRepositoryIds(repositories);
            const currentPlan = planById(plans, currentPlanId);

            closePlanChangeModal();

            const modal = document.createElement('div');
            modal.className = 'auth-modal-backdrop';
            modal.dataset.planChangeModal = 'true';
            modal.innerHTML = `<div class="auth-modal plan-change-modal" role="dialog" aria-modal="true" aria-labelledby="plan-change-title">
                <button class="icon-button auth-modal-close" type="button" data-plan-change-close aria-label="Close">x</button>
                <span class="badge brand">Billing cycle control</span>
                <h2 id="plan-change-title">Change plan</h2>
                <p class="muted">${pendingPlan ? `A downgrade to ${escapeHtml(pendingPlan.name)} is already scheduled.` : 'Choose one new plan and select the repositories that should stay active.'}</p>
                <form data-plan-change-form>
                    <div class="plan-change-grid">
                        ${plans.map((plan) => {
                            const isCurrent = Number(plan.id) === currentPlanId;
                            const isPending = Number(plan.id) === Number(subscription.pendingPricingPlanId);
                            const checked = !isCurrent && !pendingPlan && !isPending ? '' : '';
                            return `<label class="plan-change-option ${isCurrent ? 'current' : ''} ${isPending ? 'current' : ''}">
                                <input type="radio" name="pricingPlanId" value="${escapeHtml(plan.id)}" ${checked} ${isCurrent || pendingPlan ? 'disabled' : ''}>
                                <span>
                                    <strong>${escapeHtml(plan.name)}${isCurrent ? ' · current' : ''}${isPending ? ' · scheduled' : ''}</strong>
                                    ${renderPlanDetailBlock(plan, { statusNote: isCurrent ? 'Current package' : isPending ? 'Scheduled package' : '' })}
                                </span>
                            </label>`;
                        }).join('')}
                    </div>
                    <div class="repository-select-list">
                        ${repositories.length === 0
                            ? '<p class="muted small">No GitHub repositories are connected yet. Connect GitHub before changing plan limits.</p>'
                            : repositories.map((repository) => `<label class="repository-select-row">
                                <input type="checkbox" name="repositoryIds" value="${escapeHtml(repository.id)}" ${currentActiveIds.includes(Number(repository.id)) ? 'checked' : ''} ${pendingPlan ? 'disabled' : ''}>
                                <span><strong>${escapeHtml(repository.fullName || repository.name)}</strong><small>${repository.isActive ? 'Active for scanning' : 'Inactive'}</small></span>
                            </label>`).join('')}
                    </div>
                    <p class="muted small" data-plan-change-summary>${pendingPlan ? `Scheduled for ${subscription.pendingPlanChangeEffectiveAt ? escapeHtml(formatDate(subscription.pendingPlanChangeEffectiveAt)) : 'next billing period'}.` : currentPlan ? `Current plan: ${escapeHtml(currentPlan.name)}.` : 'Choose a new plan.'}</p>
                    <button class="button primary" type="submit" data-plan-change-submit ${pendingPlan || repositories.length === 0 ? 'disabled' : ''} style="width:100%">Submit plan change</button>
                    <p class="muted small" data-form-status style="margin:12px 0 0"></p>
                </form>
            </div>`;

            document.body.appendChild(modal);

            const selectablePlan = modal.querySelector('input[name="pricingPlanId"]:not(:disabled)');
            if (selectablePlan) {
                selectablePlan.checked = true;
            }
            updatePlanChangeSummary(modal, options);

            modal.addEventListener('click', function (event) {
                if (event.target === modal || event.target.closest('[data-plan-change-close]')) {
                    closePlanChangeModal();
                }
            });

            modal.addEventListener('change', function () {
                updatePlanChangeSummary(modal, options);
            });

            modal.querySelector('[data-plan-change-form]')?.addEventListener('submit', async function (event) {
                event.preventDefault();
                const form = event.currentTarget;
                const submit = form.querySelector('[data-plan-change-submit]');
                const status = form.querySelector('[data-form-status]');
                const selectedPlanId = Number(form.querySelector('input[name="pricingPlanId"]:checked')?.value);
                const selectedRepositoryIds = Array.from(form.querySelectorAll('input[name="repositoryIds"]:checked')).map((input) => Number(input.value));
                const submitText = submit.textContent;

                submit.disabled = true;
                submit.textContent = 'Submitting...';

                try {
                    const result = await apiFetch('/api/user/billing/change-plan', {
                        method: 'POST',
                        body: JSON.stringify({ pricingPlanId: selectedPlanId, repositoryIds: selectedRepositoryIds })
                    });
                    if (status) {
                        status.textContent = result.message || 'Plan change submitted.';
                        status.style.color = 'var(--success)';
                    }
                    await hydrateBilling();
                    setTimeout(closePlanChangeModal, 900);
                } catch (error) {
                    if (status) {
                        status.textContent = error.message || 'Plan change could not be submitted.';
                        status.style.color = 'var(--danger)';
                    }
                    submit.disabled = false;
                    submit.textContent = submitText;
                }
            });
        } catch (error) {
            alert(error.message || 'Plan change options could not be loaded.');
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    }

    function setOnboardingStep(key, state, copy, actionText, actionHref) {
        const card = document.querySelector(`[data-onboarding-step="${key}"]`);
        if (!card) return;
        const stepNumbers = { account: '1', billing: '2', github: '3', repositories: '4', scan: '5' };
        card.classList.toggle('active', state === 'active');
        card.classList.toggle('completed', state === 'done');
        card.classList.toggle('locked', state === 'locked');
        const number = card.querySelector('.step-number');
        const copyNode = card.querySelector(`[data-step-copy="${key}"]`);
        const action = card.querySelector(`[data-step-action="${key}"]`);
        if (number) number.textContent = state === 'done' ? '✓' : (stepNumbers[key] || '');
        if (copyNode) copyNode.textContent = copy;
        if (action && actionText) action.textContent = actionText;
        if (action) {
            action.disabled = state === 'locked';
            action.classList.toggle('is-disabled', state === 'locked');
            if (action.tagName === 'A') {
                action.setAttribute('aria-disabled', String(state === 'locked'));
                if (actionHref) action.href = actionHref;
            }
        }
    }

    function updateOnboardingAction(input) {
        const title = document.querySelector('[data-onboarding-action-title]');
        const copy = document.querySelector('[data-onboarding-action-copy]');
        const badge = document.querySelector('[data-onboarding-action-badge]');
        const primary = document.querySelector('[data-onboarding-primary-action]');
        const secondary = document.querySelector('[data-onboarding-secondary-action]');
        const wizardTitle = document.querySelector('[data-onboarding-wizard-title]');
        const wizardCopy = document.querySelector('[data-onboarding-wizard-copy]');
        const wizardBadge = document.querySelector('[data-onboarding-wizard-badge]');

        if (title) title.textContent = input.title;
        if (copy) copy.textContent = input.copy;
        if (badge) {
            badge.textContent = input.badge;
            badge.className = `badge ${input.badgeClass || 'brand'}`;
        }
        if (wizardTitle) wizardTitle.textContent = input.wizardTitle || 'Finish setup';
        if (wizardCopy) wizardCopy.textContent = input.wizardCopy || input.copy;
        if (wizardBadge) {
            wizardBadge.textContent = input.wizardBadge || input.badge;
            wizardBadge.className = `badge ${input.badgeClass || 'brand'}`;
        }
        if (primary) {
            primary.textContent = input.primaryText;
            primary.href = input.primaryHref;
            if (input.provider) {
                primary.dataset.providerConnect = input.provider;
            } else {
                delete primary.dataset.providerConnect;
            }
        }
        if (secondary) {
            secondary.hidden = !input.secondaryText;
            secondary.textContent = input.secondaryText || '';
            if (input.secondaryHref) {
                secondary.href = input.secondaryHref;
            }
        }
    }

    async function hydrateOnboarding() {
        const badge = document.querySelector('[data-onboarding-badge]');
        if (!badge) {
            return;
        }

        const checkoutStatus = new URLSearchParams(window.location.search).get('checkout');
        const signupStatus = new URLSearchParams(window.location.search).get('signup');
        const wizard = document.querySelector('[data-onboarding-wizard]');
        const [billingResult, repositoriesResult, dashboardResult] = await Promise.allSettled([
            apiFetch('/api/user/billing'),
            apiFetch('/api/user/repositories?limit=1'),
            apiFetch('/api/user/dashboard-summary')
        ]);
        let billingPayload = billingResult.status === 'fulfilled' ? billingResult.value : {};
        let subscription = billingPayload.data?.subscription || null;
        let state = subscriptionState(subscription);

        if (checkoutStatus === 'success' && !state.isActive && wizard && wizard.dataset.checkoutRecoveryAttempted !== 'true') {
            wizard.dataset.checkoutRecoveryAttempted = 'true';
            try {
                await apiFetch('/api/user/billing/paddle-sync', {
                    method: 'POST',
                    body: JSON.stringify({ recoverByEmail: true })
                });
                billingPayload = await apiFetch('/api/user/billing');
                subscription = billingPayload.data?.subscription || null;
                state = subscriptionState(subscription);
            } catch (error) {
                // The webhook may still activate the subscription during the bounded polling below.
            }
        }

        const repoPayload = repositoriesResult.status === 'fulfilled' ? repositoriesResult.value : {};
        const dashboard = dashboardResult.status === 'fulfilled' ? dashboardResult.value.data || {} : {};
        const githubConnected = Boolean(repoPayload.meta?.githubConnection || dashboard.githubConnection);
        const repositoryCount = Number(repoPayload.meta?.repositoryCount || dashboard.metrics?.repositories || 0);
        const scanCount = Number(dashboard.metrics?.scans || 0);
        const checkoutToken = billingPayload.data?.checkoutToken || '';
        const checkoutHref = checkoutToken ? `/checkout?t=${encodeURIComponent(checkoutToken)}` : '/checkout';

        setOnboardingStep('account', 'done', 'Your SecureRepos account and workspace are ready.');
        setOnboardingStep('billing', state.isActive ? 'done' : 'active', state.isActive ? 'Subscription active. You can connect GitHub now.' : 'Complete Paddle checkout to activate scanning.', state.isActive ? 'View subscription' : 'Continue to checkout', state.isActive ? '/billing' : checkoutHref);
        setOnboardingStep('github', state.isActive ? (githubConnected ? 'done' : 'active') : 'locked', githubConnected ? 'GitHub App is connected.' : state.isActive ? 'Install the GitHub App and select repositories.' : 'Activate billing before connecting repositories.', githubConnected ? 'Connected' : 'Install GitHub App');
        setOnboardingStep('repositories', githubConnected ? (repositoryCount > 0 ? 'done' : 'active') : 'locked', repositoryCount > 0 ? `${repositoryCount} repositories synced.` : githubConnected ? 'Waiting for selected repositories to sync.' : 'Repositories appear after GitHub is connected.', 'View repositories');
        setOnboardingStep('scan', repositoryCount > 0 ? (scanCount > 0 ? 'done' : 'active') : 'locked', scanCount > 0 ? `${scanCount} scans recorded. Review findings from the dashboard.` : repositoryCount > 0 ? 'Run your first scan from the repository table.' : 'Connect a repository before running scans.', scanCount > 0 ? 'Open scans' : 'Start scan');

        badge.textContent = state.isActive && githubConnected && repositoryCount > 0 ? 'Ready' : 'Setup';
        badge.className = `badge ${state.isActive && githubConnected ? 'success' : 'brand'}`;

        if (!state.isActive) {
            updateOnboardingAction({
                title: signupStatus === 'check-email' ? 'Your checkout is ready' : checkoutStatus === 'success' ? 'Waiting for payment confirmation' : 'Activate your plan',
                copy: signupStatus === 'check-email'
                    ? 'Continue directly to Paddle below. We also emailed the same secure checkout link so you can resume later.'
                    : checkoutStatus === 'success'
                    ? 'Paddle checkout finished. SecureRepos is waiting for the webhook confirmation before GitHub setup unlocks.'
                    : 'Choose a package and complete Paddle checkout. Repository scanning starts after payment is confirmed.',
                badge: signupStatus === 'check-email' ? 'Checkout ready' : checkoutStatus === 'success' ? 'Syncing' : 'Step 2',
                badgeClass: signupStatus === 'check-email' || checkoutStatus === 'success' ? 'warning' : 'brand',
                wizardTitle: 'Plan activation',
                wizardBadge: signupStatus === 'check-email' ? 'Ready' : checkoutStatus === 'success' ? 'Waiting' : 'Next',
                primaryText: checkoutStatus === 'success' ? 'Refresh status' : 'Continue to checkout',
                primaryHref: checkoutStatus === 'success' ? '/onboarding?checkout=success' : checkoutHref,
                secondaryText: '',
                secondaryHref: ''
            });
        } else if (!githubConnected) {
            updateOnboardingAction({
                title: 'Connect GitHub',
                copy: 'Install the GitHub App and select the repositories you want SecureRepos to scan.',
                badge: 'Step 3',
                badgeClass: 'brand',
                wizardTitle: 'GitHub access',
                wizardBadge: 'Next',
                primaryText: 'Install GitHub App',
                primaryHref: '#',
                provider: 'github',
                secondaryText: 'Open billing',
                secondaryHref: '/billing'
            });
        } else if (repositoryCount === 0) {
            updateOnboardingAction({
                title: 'Repository sync in progress',
                copy: 'GitHub is connected. Selected repositories should appear after sync; refresh this page or open repositories to check status.',
                badge: 'Syncing',
                badgeClass: 'warning',
                wizardTitle: 'Repository sync',
                wizardBadge: 'Waiting',
                primaryText: 'Open repositories',
                primaryHref: '/repositories',
                secondaryText: 'Refresh status',
                secondaryHref: '/onboarding'
            });
        } else if (scanCount === 0) {
            updateOnboardingAction({
                title: 'Run your first scan',
                copy: `${repositoryCount} repositories are ready. Start a scan from the repository table to review your first findings.`,
                badge: 'Step 5',
                badgeClass: 'brand',
                wizardTitle: 'First scan',
                wizardBadge: 'Next',
                primaryText: 'Start first scan',
                primaryHref: '/repositories',
                secondaryText: 'Open dashboard',
                secondaryHref: '/dashboard'
            });
        } else {
            updateOnboardingAction({
                title: 'Workspace ready',
                copy: 'Your plan, GitHub connection, repository sync, and first scan are ready. Continue from the dashboard.',
                badge: 'Ready',
                badgeClass: 'success',
                wizardTitle: 'Setup complete',
                wizardBadge: 'Ready',
                primaryText: 'Open dashboard',
                primaryHref: '/dashboard',
                secondaryText: 'View scans',
                secondaryHref: '/scans'
            });
        }

        const copy = document.querySelector('[data-onboarding-copy]');
        if (copy) {
            copy.textContent = state.isActive
                ? githubConnected
                    ? 'Your subscription and GitHub connection are ready. Review repositories and run scans.'
                    : 'Your subscription is active. Install the GitHub App to sync repositories.'
                : 'Activate your plan first, then connect GitHub and run your first scan.';
            if (signupStatus === 'check-email' && !state.isActive) {
                copy.textContent = 'Your workspace and selected plan are ready. Complete checkout, then connect GitHub.';
            }
        }

        if (checkoutStatus === 'success' && !state.isActive && wizard) {
            const pollAttempt = Number(wizard.dataset.checkoutPollAttempt || 0);
            if (pollAttempt < 8) {
                wizard.dataset.checkoutPollAttempt = String(pollAttempt + 1);
                window.setTimeout(hydrateOnboarding, 2500);
            }
        } else if (state.isActive && checkoutStatus === 'success') {
            window.history.replaceState({}, '', '/onboarding');
        }
    }

    async function hydrateRepositories() {
        const table = document.querySelector('[data-api-table="repositories"]');
        if (!table) {
            return;
        }

        const inventory = document.querySelector('[data-repository-inventory]');
        if (!inventory && table.hasAttribute('data-dashboard-repositories')) {
            return;
        }
        const repositoryState = pageState.repositories;
        const query = inventory
            ? `?limit=5${repositoryState.cursor ? `&cursor=${encodeURIComponent(repositoryState.cursor)}` : ''}${repositoryState.filter !== 'all' ? `&status=${encodeURIComponent(repositoryState.filter)}` : ''}`
            : '';
        const payload = await apiFetch(`/api/user/repositories${query}`);
        const rows = payload.data || [];
        const notice = document.querySelector('[data-repository-limit-notice]');
        const plan = payload.meta?.plan || {};
        const repositoryLimit = plan.repositoryLimit;
        repositoryState.nextCursor = payload.pagination?.nextCursor || null;
        repositoryState.total = payload.meta?.repositoryCount ?? rows.length;
        renderRepositoriesGithubConnection(payload.meta?.githubConnection);
        renderRepositoryPagination(rows.length);

        if (notice) {
            const hasLimit = repositoryLimit !== null && repositoryLimit !== undefined;
            notice.hidden = false;
            notice.innerHTML = `<div class="row-between"><div><strong>Repository selection limit</strong><p class="muted small" style="margin:6px 0 0">${hasLimit ? `Your ${escapeHtml(plan.name || 'current')} plan allows ${escapeHtml(repositoryLimit)} active repositories. When installing the GitHub App, select only the repositories you want scanned for this billing cycle. If you choose all repositories, SecureRepos will keep the first ${escapeHtml(repositoryLimit)} synced repositories active and the remaining repositories can be added after your plan or next cycle allows it.` : 'Your current plan does not limit active repositories.'}</p></div><span class="badge brand">${escapeHtml(payload.meta?.repositoryCount ?? rows.length)}${hasLimit ? ` / ${escapeHtml(repositoryLimit)}` : ''} repos</span></div>`;
        }

        if (!rows.length) {
            table.innerHTML = '<tr><td colspan="6">No repositories connected yet.</td></tr>';
            return;
        }

        table.innerHTML = rows.map(renderRepositoryRow).join('');
    }

    function renderRepositoryRow(repo) {
        const score = repo.securityScore ?? repo.score ?? 0;
        const status = score >= 85 ? 'Healthy' : score >= 70 ? 'Review' : 'Critical';
        const badge = score >= 85 ? 'success' : score >= 70 ? 'warning' : 'danger';
        const repoName = repo.fullName || repo.name || 'Repository';
        const githubUrl = getGithubRepositoryUrl(repo);
        const githubLink = githubUrl
            ? `<a class="repo-github-link" href="${escapeHtml(githubUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(repoName)} on GitHub">${githubIcon()}</a>`
            : `<span class="repo-github-link is-disabled" aria-hidden="true">${githubIcon()}</span>`;

        return `<tr><td><div class="repo-name-cell">${githubLink}<a href="/repositories/${escapeHtml(repo.id)}">${escapeHtml(repoName)}</a></div></td><td>${escapeHtml(repo.provider || repo.codeHostProvider || '-')}</td><td>${escapeHtml(repo.defaultBranch || 'main')}</td><td>${score}</td><td><span class="badge ${badge}">${status}</span></td><td><button class="button" type="button" data-repository-scan="${escapeHtml(repo.id)}">Scan</button></td></tr>`;
    }

    function setRepositoryFilter(button) {
        pageState.repositories.filter = button.dataset.repositoryFilter || 'all';
        pageState.repositories.cursor = null;
        pageState.repositories.previousCursors = [];
        pageState.repositories.nextCursor = null;
        pageState.repositories.page = 1;

        document.querySelectorAll('[data-repository-filter]').forEach(function (item) {
            item.classList.toggle('active', item === button);
        });

        hydrateRepositories();
    }

    function changeRepositoryPage(button) {
        const direction = button.dataset.repositoryPage;
        const repositoryState = pageState.repositories;

        if (direction === 'next' && repositoryState.nextCursor) {
            repositoryState.previousCursors.push(repositoryState.cursor);
            repositoryState.cursor = repositoryState.nextCursor;
            repositoryState.page += 1;
            hydrateRepositories();
        }

        if (direction === 'prev' && repositoryState.previousCursors.length) {
            repositoryState.cursor = repositoryState.previousCursors.pop() || null;
            repositoryState.page = Math.max(1, repositoryState.page - 1);
            hydrateRepositories();
        }
    }

    function renderRepositoryPagination(visibleCount) {
        const pagination = document.querySelector('[data-repository-pagination]');
        if (!pagination) {
            return;
        }

        const repositoryState = pageState.repositories;
        const summary = pagination.querySelector('[data-repository-page-summary]');
        const previous = pagination.querySelector('[data-repository-page="prev"]');
        const next = pagination.querySelector('[data-repository-page="next"]');
        const filterLabel = repositoryState.filter === 'all' ? 'repositories' : `${repositoryState.filter} repositories`;

        if (summary) {
            summary.textContent = visibleCount
                ? `Page ${repositoryState.page} · ${visibleCount} shown · ${repositoryState.total} ${filterLabel}`
                : `No ${filterLabel} found`;
        }
        if (previous) {
            previous.disabled = repositoryState.previousCursors.length === 0;
        }
        if (next) {
            next.disabled = !repositoryState.nextCursor;
        }
    }

    function renderRepositoriesGithubConnection(githubConnection) {
        const connectedCard = document.querySelector('[data-github-connected-card]');
        const disconnectedCard = document.querySelector('[data-github-disconnected-card]');
        const installAction = document.querySelector('[data-github-install-action]');
        const toolbarCopy = document.querySelector('[data-repositories-toolbar-copy]');

        if (!connectedCard && !disconnectedCard) {
            return;
        }

        if (!githubConnection) {
            if (connectedCard) {
                connectedCard.hidden = true;
            }
            if (disconnectedCard) {
                disconnectedCard.hidden = false;
            }
            if (installAction) {
                installAction.hidden = false;
                installAction.textContent = 'Install GitHub App';
            }
            if (toolbarCopy) {
                toolbarCopy.textContent = 'Install the GitHub App, review repository scores, and start manual scans.';
            }
            return;
        }

        const login = githubConnection.accountLogin || 'GitHub connected';
        const syncedAt = githubConnection.lastSyncAt || githubConnection.updatedAt || githubConnection.createdAt;
        const loginNode = document.querySelector('[data-repositories-github-login]');
        const linkNode = document.querySelector('[data-repositories-github-link]');
        const metaNode = document.querySelector('[data-repositories-github-meta]');

        if (connectedCard) {
            connectedCard.hidden = false;
        }
        if (disconnectedCard) {
            disconnectedCard.hidden = true;
        }
        if (installAction) {
            installAction.hidden = true;
        }
        if (toolbarCopy) {
            toolbarCopy.textContent = 'Review synced repositories, score changes, and run manual scans.';
        }
        if (loginNode) {
            loginNode.textContent = login;
        }
        if (linkNode) {
            linkNode.href = githubConnection.accountLogin ? `https://github.com/${encodeURIComponent(githubConnection.accountLogin)}` : 'https://github.com';
        }
        if (metaNode) {
            metaNode.textContent = `${githubConnection.accountType || 'Account'} · last synced ${formatDateTime(syncedAt)}`;
        }
    }

    async function queueRepositoryScan(button) {
        const repositoryId = button.dataset.repositoryScan;
        const originalText = button.textContent;

        if (!repositoryId) {
            return;
        }

        try {
            button.disabled = true;
            button.textContent = 'Queueing...';
            await apiFetch(`/api/user/repositories/${encodeURIComponent(repositoryId)}/scans`, { method: 'POST' });
            button.textContent = 'Queued';
            setTimeout(function () {
                button.textContent = originalText;
                button.disabled = false;
            }, 1800);
        } catch (error) {
            button.textContent = 'Failed';
            button.title = error.message;
            setTimeout(function () {
                button.textContent = originalText;
                button.disabled = false;
                button.removeAttribute('title');
            }, 2200);
        }
    }

    function renderScanRow(scan) {
        const total = Number(scan.findingsCritical || 0) + Number(scan.findingsHigh || 0) + Number(scan.findingsMedium || 0) + Number(scan.findingsLow || 0);
        const status = String(scan.status || '-');
        const badge = status === 'completed' ? 'success' : status === 'failed' ? 'danger' : status === 'running' ? 'warning' : 'brand';
        const repo = scan.repository?.fullName || scan.repository?.name || '-';

        return `<tr><td>#${escapeHtml(scan.id)}</td><td>${escapeHtml(repo)}</td><td><span class="badge ${badge}">${escapeHtml(status)}</span></td><td>${escapeHtml(scan.triggerType || '-')}</td><td>${escapeHtml(total)}</td><td>${formatDate(scan.completedAt || scan.updatedAt || scan.createdAt)}</td><td><a class="button" href="/scans/${escapeHtml(scan.id)}">View details</a></td></tr>`;
    }

    function renderFindingRow(finding) {
        const severity = String(finding.severity || 'medium');
        const badge = severity === 'critical' ? 'danger' : severity === 'high' ? 'warning' : 'brand';
        const remediation = finding.remediation || finding.description || 'Review the affected file, apply the recommended secure configuration, then run the scan again.';

        return `<tr><td><a href="/findings/${finding.id}">${escapeHtml(finding.title || finding.ruleId || 'Finding')}</a><div class="muted small">${escapeHtml(finding.repository?.name || finding.repositoryName || 'Repository')} / ${escapeHtml(finding.filePath || '-')}</div></td><td><span class="badge ${badge}">${escapeHtml(severity)}</span></td><td><button class="button" type="button" data-mitigation-open data-finding-id="${escapeHtml(finding.id)}" data-finding-title="${escapeHtml(finding.title || finding.ruleId || 'Finding')}" data-finding-severity="${escapeHtml(severity)}" data-finding-file="${escapeHtml(finding.filePath || '-')}" data-finding-remediation="${escapeHtml(remediation)}">Mitigate</button></td></tr>`;
    }

    function ensureMitigationPanel() {
        let panel = document.querySelector('[data-mitigation-panel]');
        if (panel) {
            return panel;
        }

        panel = document.createElement('div');
        panel.className = 'mitigation-overlay';
        panel.hidden = true;
        panel.dataset.mitigationPanel = 'true';
        panel.innerHTML = `<div class="mitigation-panel" role="dialog" aria-modal="true" aria-labelledby="mitigation-title">
            <div class="card-header">
                <div><h2 class="card-title" id="mitigation-title">Mitigation</h2><p class="muted small" data-mitigation-file style="margin:4px 0 0"></p></div>
                <button class="icon-button" type="button" data-mitigation-close aria-label="Close mitigation">×</button>
            </div>
            <div class="card-body">
                <span class="badge brand" data-mitigation-severity></span>
                <p style="margin:14px 0 8px;font-weight:800">Recommended process</p>
                <ol class="mitigation-steps">
                    <li>Open the affected file and inspect the highlighted pattern.</li>
                    <li data-mitigation-remediation></li>
                    <li>Commit the code/config change, deploy if needed, then run a new scan.</li>
                    <li>Only mark this finding resolved after the new scan confirms the risk is gone or you have verified the fix.</li>
                </ol>
                <div class="toolbar-actions" style="justify-content:flex-start;margin-top:16px">
                    <button class="button primary" type="button" data-mitigation-resolve>Mark resolved after fix</button>
                    <button class="button" type="button" data-mitigation-close>Close</button>
                </div>
                <p class="muted small" data-mitigation-status style="margin:12px 0 0"></p>
            </div>
        </div>`;
        document.body.appendChild(panel);
        return panel;
    }

    function openMitigationPanel(button) {
        const panel = ensureMitigationPanel();
        panel.querySelector('#mitigation-title').textContent = button.dataset.findingTitle || 'Mitigation';
        panel.querySelector('[data-mitigation-file]').textContent = button.dataset.findingFile || '';
        panel.querySelector('[data-mitigation-severity]').textContent = button.dataset.findingSeverity || 'finding';
        panel.querySelector('[data-mitigation-remediation]').textContent = button.dataset.findingRemediation || 'Apply the secure remediation for this finding.';
        panel.querySelector('[data-mitigation-resolve]').dataset.findingId = button.dataset.findingId || '';
        panel.querySelector('[data-mitigation-status]').textContent = '';
        panel.hidden = false;
    }

    function closeMitigationPanel() {
        const panel = document.querySelector('[data-mitigation-panel]');
        if (panel) {
            panel.hidden = true;
        }
    }

    async function resolveFinding(button) {
        const findingId = button.dataset.findingId;
        const status = document.querySelector('[data-mitigation-status]');

        if (!findingId) {
            return;
        }

        try {
            button.disabled = true;
            button.textContent = 'Resolving...';
            await apiFetch(`/api/user/findings/${encodeURIComponent(findingId)}`, { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) });
            if (status) {
                status.textContent = 'Finding marked resolved. Run a scan again to confirm it stays closed.';
                status.style.color = 'var(--success)';
            }
            await hydrateDashboard();
        } catch (error) {
            if (status) {
                status.textContent = error.message;
                status.style.color = 'var(--danger)';
            }
        } finally {
            button.disabled = false;
            button.textContent = 'Mark resolved after fix';
        }
    }

    async function hydrateScans() {
        const table = document.querySelector('[data-api-table="scans"]');
        if (!table) {
            return;
        }

        const scanState = pageState.scans;
        const cursor = scanState.cursor ? `&cursor=${encodeURIComponent(scanState.cursor)}` : '';
        const payload = await apiFetch(`/api/user/scans?limit=5${cursor}`);
        const scans = payload.data || [];
        const rows = scans.map(renderScanRow);

        table.innerHTML = rows.join('') || '<tr><td colspan="7">No scans have run yet.</td></tr>';

        scanState.nextCursor = payload.pagination?.nextCursor || null;
        scanState.total = payload.total || scans.length;

        const total = document.querySelector('[data-scan-total]');
        if (total) {
            total.textContent = `${scanState.total} scans`;
        }

        renderScanPagination(scans.length);
    }

    function changeScanPage(button) {
        const direction = button.dataset.scanPage;
        const scanState = pageState.scans;

        if (direction === 'next' && scanState.nextCursor) {
            scanState.previousCursors.push(scanState.cursor);
            scanState.cursor = scanState.nextCursor;
            scanState.page += 1;
            hydrateScans();
        }

        if (direction === 'prev' && scanState.previousCursors.length) {
            scanState.cursor = scanState.previousCursors.pop() || null;
            scanState.page = Math.max(1, scanState.page - 1);
            hydrateScans();
        }
    }

    function renderScanPagination(visibleCount) {
        const pagination = document.querySelector('[data-scan-pagination]');
        if (!pagination) {
            return;
        }

        const scanState = pageState.scans;
        const summary = pagination.querySelector('[data-scan-page-summary]');
        const previous = pagination.querySelector('[data-scan-page="prev"]');
        const next = pagination.querySelector('[data-scan-page="next"]');

        if (summary) {
            summary.textContent = visibleCount
                ? `Page ${scanState.page} · ${visibleCount} shown · ${scanState.total} scans`
                : 'No scans found';
        }
        if (previous) {
            previous.disabled = scanState.previousCursors.length === 0;
        }
        if (next) {
            next.disabled = !scanState.nextCursor;
        }
    }

    async function hydrateScanDetail() {
        const root = document.querySelector('[data-scan-detail]');
        if (!root) {
            return;
        }

        const scanId = root.dataset.scanDetail;
        const payload = await apiFetch(`/api/user/scans/${encodeURIComponent(scanId)}`);
        const data = payload.data || {};
        const scan = data.scan || {};
        const repository = scan.repository || {};
        const findings = data.findings || [];
        const branchSummary = data.branchSummary || [];
        const total = Number(scan.findingsCritical || 0) + Number(scan.findingsHigh || 0) + Number(scan.findingsMedium || 0) + Number(scan.findingsLow || 0);

        document.querySelector('[data-scan-detail-title]').textContent = `Scan #${scan.id || scanId}`;
        document.querySelector('[data-scan-detail-subtitle]').textContent = repository.fullName || repository.name || 'Repository scan';
        document.querySelector('[data-scan-detail-metric="status"]').textContent = scan.status || '--';
        document.querySelector('[data-scan-detail-metric="critical"]').textContent = scan.findingsCritical ?? 0;
        document.querySelector('[data-scan-detail-metric="high"]').textContent = scan.findingsHigh ?? 0;
        document.querySelector('[data-scan-detail-metric="total"]').textContent = total;

        const info = document.querySelector('[data-scan-detail-info]');
        if (info) {
            info.innerHTML = [
                ['Trigger', scan.triggerType || '-'],
                ['Branch', scan.branch || '-'],
                ['Commit', scan.commitSha || '-'],
                ['Started', formatDateTime(scan.startedAt)],
                ['Completed', formatDateTime(scan.completedAt)],
                ['Created', formatDateTime(scan.createdAt)]
            ].map(renderDetailItem).join('');
        }

        const repo = document.querySelector('[data-scan-detail-repository]');
        if (repo) {
            const repoUrl = getGithubRepositoryUrl(repository);
            repo.innerHTML = [
                ['Repository', repoUrl ? `<a href="${escapeHtml(repoUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(repository.fullName || repository.name || '-')}</a>` : escapeHtml(repository.fullName || repository.name || '-')],
                ['Provider', repository.provider || 'github'],
                ['Default branch', repository.defaultBranch || '-'],
                ['Security score', repository.securityScore ?? '-']
            ].map(renderDetailItem).join('');
        }

        const errorBox = document.querySelector('[data-scan-detail-error]');
        if (errorBox && scan.errorMessage) {
            errorBox.hidden = false;
            errorBox.innerHTML = `<span class="badge danger">Error</span><p class="muted small" style="margin:8px 0 0">${escapeHtml(scan.errorMessage)}</p>`;
        }

        const findingCount = document.querySelector('[data-scan-detail-finding-count]');
        if (findingCount) {
            findingCount.textContent = `${findings.length} findings`;
        }

        const branchCount = document.querySelector('[data-scan-detail-branch-count]');
        if (branchCount) {
            branchCount.textContent = `${branchSummary.length} branches`;
        }

        const branchTable = document.querySelector('[data-scan-detail-branches]');
        if (branchTable) {
            branchTable.innerHTML = branchSummary.map(renderScanBranchRow).join('') || '<tr><td colspan="6">No branch findings were recorded for this scan.</td></tr>';
        }

        const findingsTable = document.querySelector('[data-scan-detail-findings]');
        if (findingsTable) {
            findingsTable.innerHTML = findings.map(renderScanFindingRow).join('') || '<tr><td colspan="5">No findings were recorded for this scan.</td></tr>';
        }
    }

    function renderDetailItem(item) {
        const [label, value] = item;

        return `<div class="detail-row"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`;
    }

    function renderScanFindingRow(finding) {
        const severity = String(finding.severity || 'medium');
        const badge = severity === 'critical' ? 'danger' : severity === 'high' ? 'warning' : severity === 'low' ? 'success' : 'brand';

        return `<tr><td><a href="/findings/${escapeHtml(finding.id)}">${escapeHtml(finding.title || finding.ruleId || 'Finding')}</a><div class="muted small">${escapeHtml(finding.ruleId || '')}</div></td><td>${escapeHtml(finding.branch || '-')}</td><td><span class="badge ${badge}">${escapeHtml(severity)}</span></td><td>${escapeHtml(finding.filePath || '-')}${finding.lineNumber ? `:${escapeHtml(finding.lineNumber)}` : ''}</td><td>${escapeHtml(finding.status || 'open')}</td></tr>`;
    }

    function renderScanBranchRow(branch) {
        return `<tr><td>${escapeHtml(branch.branch || '-')}</td><td><span class="badge danger">${escapeHtml(branch.critical || 0)}</span></td><td><span class="badge warning">${escapeHtml(branch.high || 0)}</span></td><td>${escapeHtml(branch.medium || 0)}</td><td>${escapeHtml(branch.low || 0)}</td><td>${escapeHtml(branch.total || 0)}</td></tr>`;
    }

    async function hydrateRepositoryDetail() {
        const root = document.querySelector('[data-repository-detail]');
        if (!root) {
            return;
        }

        const repositoryId = root.dataset.repositoryDetail;
        const payload = await apiFetch(`/api/user/repositories/${encodeURIComponent(repositoryId)}`);
        const data = payload.data || {};
        const repository = data.repository || {};
        const latestScan = data.latestScan || {};

        document.querySelector('[data-repository-title]').textContent = repository.fullName || repository.name || 'Repository posture';
        document.querySelector('[data-repository-subtitle]').textContent = repository.webUrl || 'Score, checklist, findings, and scan history.';
        document.querySelector('[data-repository-metric="score"]').textContent = repository.securityScore ?? '--';
        document.querySelector('[data-repository-metric="openFindings"]').textContent = data.openFindingsCount ?? 0;
        document.querySelector('[data-repository-metric="branch"]').textContent = repository.defaultBranch || '--';
        document.querySelector('[data-repository-metric="provider"]').textContent = repository.provider || 'github';

        const checklist = document.querySelector('[data-repository-checklist]');
        if (checklist) {
            const items = data.checklist || [];
            checklist.innerHTML = items.map(function (item) {
                return `<article class="finding-item"><span class="badge ${item.passed ? 'success' : 'warning'}">${item.passed ? 'Pass' : 'Review'}</span><div><strong>${escapeHtml(item.label)}</strong></div></article>`;
            }).join('') || '<div class="empty-state">Checklist loads after this repository has scan data.</div>';
        }

        const scans = document.querySelector('[data-repository-scans]');
        if (scans) {
            scans.innerHTML = (data.recentScans || []).map(function (scan) {
                const total = Number(scan.findingsCritical || 0) + Number(scan.findingsHigh || 0) + Number(scan.findingsMedium || 0) + Number(scan.findingsLow || 0);
                return `<tr><td>#${escapeHtml(scan.id)}</td><td><span class="badge brand">${escapeHtml(scan.status || '-')}</span></td><td>${escapeHtml(total)}</td></tr>`;
            }).join('') || '<tr><td colspan="3">No scan history yet.</td></tr>';
        }

        if (latestScan.errorMessage) {
            root.insertAdjacentHTML('afterend', `<div class="card card-body" style="margin-bottom:18px"><span class="badge danger">Latest scan failed</span><p class="muted small" style="margin:8px 0 0">${escapeHtml(latestScan.errorMessage)}</p></div>`);
        }
    }

    async function hydrateFindings() {
        const list = document.querySelector('[data-api-list="findings"]');
        if (!list) {
            return;
        }

        const statusFilter = document.querySelector('[data-findings-status-filter]');
        const status = statusFilter?.value || 'open';
        const payload = await apiFetch(`/api/user/findings?status=${encodeURIComponent(status)}`);
        const findings = payload.data || [];
        const summary = payload.meta?.summary || {};

        const setMetric = (key, value) => {
            const node = document.querySelector(`[data-finding-metric="${key}"]`);
            if (node) node.textContent = String(value ?? 0);
        };

        setMetric('critical', summary.critical);
        setMetric('high', summary.high);
        setMetric('snoozed', summary.snoozed);
        setMetric('resolved', summary.resolvedThisMonth);

        if (!findings.length) {
            const emptyLabel = status === 'all' ? 'findings' : `${status} findings`;
            list.innerHTML = `<div class="empty-state">No ${escapeHtml(emptyLabel)}. New scan results will appear here.</div>`;
            return;
        }

        list.innerHTML = findings.map(function (finding) {
            const severity = String(finding.severity || 'medium');
            const badge = severity === 'critical' ? 'danger' : severity === 'high' ? 'warning' : 'brand';
            const repo = finding.repository?.name || finding.repositoryName || 'Repository';
            const isResolved = finding.status === 'resolved';
            return `<article class="finding-item"><span class="badge ${badge}">${escapeHtml(severity)}</span><div><strong><a href="/findings/${finding.id}">${escapeHtml(finding.title || finding.ruleId || 'Finding')}</a></strong><p class="muted small">${escapeHtml(repo)} / ${escapeHtml(finding.filePath || '-')}</p><p class="muted small">Status: ${escapeHtml(finding.status || 'open')}</p></div><div class="row-actions"><button class="button" type="button" data-finding-resolve data-finding-id="${escapeHtml(finding.id)}" ${isResolved ? 'disabled' : ''}>${isResolved ? 'Resolved' : 'Resolve'}</button></div></article>`;
        }).join('');
    }

    async function resolveFindingInline(button) {
        const findingId = button.dataset.findingId;
        const originalText = button.textContent;

        if (!findingId) {
            return;
        }

        button.disabled = true;
        button.textContent = 'Resolving...';

        try {
            await apiFetch(`/api/user/findings/${encodeURIComponent(findingId)}`, { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) });
            await hydrateFindings();
        } catch (error) {
            button.disabled = false;
            button.textContent = originalText;
            alert(error.message || 'Finding could not be resolved.');
        }
    }

    async function hydrateNotificationsPage() {
        const list = document.querySelector('[data-api-list="notifications"]');
        if (!list) {
            return;
        }

        const payload = await apiFetch('/api/user/notifications?limit=25');
        const notifications = payload.data || [];
        pageState.notifications.cursor = payload.pagination?.nextCursor || null;
        pageState.notifications.hasMore = Boolean(pageState.notifications.cursor);
        list.innerHTML = notifications.map(renderNotificationCard).join('') || '<div class="empty-state">No notifications yet.</div>';

        const more = document.querySelector('[data-load-more="notifications"]');
        if (more) {
            more.hidden = !pageState.notifications.hasMore;
        }
    }

    function renderNotificationCard(notification) {
        const read = notification.readAt ? 'success' : 'brand';
        const button = notification.readAt ? '' : `<button class="button" type="button" data-notification-read="${escapeHtml(notification.id)}">Mark read</button>`;

        return `<article class="finding-item"><span class="badge ${read}">${notification.readAt ? 'Read' : 'New'}</span><div><strong>${escapeHtml(notification.title || notification.type || 'Notification')}</strong><p class="muted small">${escapeHtml(notification.message || notification.body || '')}</p></div>${button}</article>`;
    }

    async function markNotificationRead(button) {
        const notificationId = button.dataset.notificationRead;
        if (!notificationId) {
            return;
        }

        button.disabled = true;
        await apiFetch(`/api/user/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'PATCH' });
        await hydrateNotificationsPage();
    }

    async function loadMore(type, button) {
        if (type === 'scans') {
            return;
        }

        if (type === 'notifications') {
            const list = document.querySelector('[data-api-list="notifications"]');
            if (!list || !pageState.notifications.cursor) {
                return;
            }
            button.disabled = true;
            const payload = await apiFetch(`/api/user/notifications?limit=25&cursor=${encodeURIComponent(pageState.notifications.cursor)}`);
            const notifications = payload.data || [];
            list.insertAdjacentHTML('beforeend', notifications.map(renderNotificationCard).join(''));
            pageState.notifications.cursor = payload.pagination?.nextCursor || null;
            pageState.notifications.hasMore = Boolean(pageState.notifications.cursor);
            button.hidden = !pageState.notifications.hasMore;
            button.disabled = false;
        }
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

    function cliTokenState(token) {
        if (token.revokedAt) {
            return { label: 'Revoked', badge: 'danger', active: false };
        }

        if (!token.expiresAt || new Date(token.expiresAt).getTime() <= Date.now()) {
            return { label: 'Expired', badge: 'warning', active: false };
        }

        return { label: 'Active', badge: 'success', active: true };
    }

    async function hydrateCliTokens() {
        const table = document.querySelector('[data-api-table="cli-tokens"]');
        if (!table) {
            return;
        }

        try {
            const payload = await apiFetch('/api/user/cli-tokens');
            const tokens = payload.data || [];

            table.innerHTML = tokens.map(function (token) {
                const state = cliTokenState(token);
                const preview = `${token.tokenPrefix || 'srp_cli_'}...${token.tokenLastFour || ''}`;

                return `<tr>
                    <td><strong>${escapeHtml(token.name || 'CLI token')}</strong><small class="table-subcopy">Created ${escapeHtml(formatDate(token.createdAt))}</small></td>
                    <td><code>${escapeHtml(preview)}</code></td>
                    <td><span class="badge ${state.badge}">${state.label}</span><small class="table-subcopy">Expires ${escapeHtml(formatDate(token.expiresAt))}</small></td>
                    <td>${token.lastUsedAt ? escapeHtml(formatDateTime(token.lastUsedAt)) : 'Never'}</td>
                    <td><button class="button compact danger" type="button" data-cli-token-revoke="${escapeHtml(token.id)}" data-cli-token-name="${escapeHtml(token.name || 'CLI token')}" ${state.active ? '' : 'disabled'}>Revoke</button></td>
                </tr>`;
            }).join('') || '<tr><td colspan="5">No CLI tokens created yet.</td></tr>';
        } catch (error) {
            table.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message || 'CLI tokens could not be loaded.')}</td></tr>`;
        }
    }

    function showCliTokenSecret(token, accessToken) {
        if (!token) {
            return;
        }

        document.querySelector('[data-cli-token-modal]')?.remove();
        const modal = document.createElement('div');
        modal.className = 'auth-modal-backdrop';
        modal.dataset.cliTokenModal = 'true';
        modal.innerHTML = `<div class="auth-modal cli-token-modal" role="dialog" aria-modal="true" aria-labelledby="cli-token-secret-title">
            <button class="icon-button auth-modal-close" type="button" data-cli-token-modal-close aria-label="Close">x</button>
            <span class="badge success">Token generated</span>
            <h2 id="cli-token-secret-title">${escapeHtml(accessToken?.name || 'CLI access token')}</h2>
            <p class="muted">Copy this token now. SecureRepos stores only its hash, so the full value cannot be shown again.</p>
            <div class="cli-token-secret-row">
                <input class="input" type="text" readonly value="${escapeHtml(token)}" data-cli-token-secret>
                <button class="button primary" type="button" data-cli-token-copy>Copy token</button>
            </div>
            <p class="muted small">Expires ${escapeHtml(formatDate(accessToken?.expiresAt))}. Revoke it immediately if it is exposed.</p>
        </div>`;
        document.body.appendChild(modal);
        modal.querySelector('[data-cli-token-secret]')?.select();
        modal.addEventListener('click', function (event) {
            if (event.target === modal) modal.remove();
        });
    }

    async function copyCliToken(button) {
        const input = button.closest('[data-cli-token-modal]')?.querySelector('[data-cli-token-secret]');
        if (!input) return;

        try {
            await navigator.clipboard.writeText(input.value);
        } catch (error) {
            input.select();
            document.execCommand('copy');
        }

        const originalText = button.textContent;
        button.textContent = 'Copied';
        window.setTimeout(function () {
            button.textContent = originalText;
        }, 1400);
    }

    function showCliTokenRevokeConfirmation(button) {
        const tokenId = Number(button.dataset.cliTokenRevoke);
        if (!Number.isSafeInteger(tokenId) || tokenId < 1) return;

        document.querySelector('[data-cli-token-modal]')?.remove();
        const modal = document.createElement('div');
        modal.className = 'auth-modal-backdrop';
        modal.dataset.cliTokenModal = 'true';
        modal.innerHTML = `<div class="auth-modal" role="alertdialog" aria-modal="true" aria-labelledby="cli-token-revoke-title">
            <button class="icon-button auth-modal-close" type="button" data-cli-token-modal-close aria-label="Close">x</button>
            <span class="badge danger">Revoke access</span>
            <h2 id="cli-token-revoke-title">Revoke ${escapeHtml(button.dataset.cliTokenName || 'this token')}?</h2>
            <p class="muted">Any CLI using this token will lose access immediately. This action cannot be undone.</p>
            <div class="row-actions">
                <button class="button" type="button" data-cli-token-modal-close>Keep token</button>
                <button class="button danger" type="button" data-cli-token-revoke-confirm>Revoke token</button>
            </div>
            <p class="muted small" data-cli-token-revoke-status></p>
        </div>`;
        document.body.appendChild(modal);
        modal.querySelector('[data-cli-token-revoke-confirm]')?.focus();
        modal.addEventListener('click', async function (event) {
            if (event.target === modal) {
                modal.remove();
                return;
            }

            const confirmButton = event.target.closest('[data-cli-token-revoke-confirm]');
            if (!confirmButton) return;

            confirmButton.disabled = true;
            confirmButton.textContent = 'Revoking...';

            try {
                await apiFetch(`/api/user/cli-tokens/${encodeURIComponent(tokenId)}`, { method: 'DELETE' });
                modal.remove();
                await hydrateCliTokens();
                await hydrateAuditLogs();
            } catch (error) {
                const status = modal.querySelector('[data-cli-token-revoke-status]');
                if (status) {
                    status.textContent = error.message || 'CLI token could not be revoked.';
                    status.style.color = 'var(--danger)';
                }
                confirmButton.disabled = false;
                confirmButton.textContent = 'Revoke token';
            }
        });
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

    function getMePayload() {
        if (!mePayloadPromise) {
            mePayloadPromise = apiFetch('/api/user/me');
        }

        return mePayloadPromise;
    }

    async function hydrateSessionSummary() {
        const chip = document.querySelector('[data-session-summary]');
        if (!chip) {
            return;
        }

        const payload = await getMePayload();
        const user = payload.data;
        const session = payload.data?.session;

        document.querySelectorAll('[data-account-email]').forEach(function (node) {
            node.textContent = user?.email || 'Signed-in account';
            node.title = user?.email || '';
        });

        if (!session) {
            return;
        }

        const userAgent = session.userAgent || navigator.userAgent || '';
        const browser = detectBrowser(userAgent);
        const platform = detectPlatform(userAgent);
        const browserNode = chip.querySelector('[data-session-browser]');
        const metaNode = chip.querySelector('[data-session-meta]');
        const deviceIconNode = chip.querySelector('[data-session-device-icon]');
        const browserIconNode = chip.querySelector('[data-session-browser-icon]');

        chip.hidden = false;
        browserNode.textContent = `${browser.name} on ${platform.name}`;
        metaNode.textContent = `Last login ${formatDateTime(session.createdAt)}${session.ipAddress ? ` · ${session.ipAddress}` : ''}`;
        deviceIconNode.innerHTML = platform.icon;
        browserIconNode.innerHTML = browser.icon;
        chip.title = userAgent;
    }

    async function connectProvider(button, provider) {
        const originalText = button.textContent;

        try {
            button.textContent = 'Redirecting...';
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

    function showFormStatus(form, message, isError) {
        const status = form.querySelector('[data-form-status]');
        if (status) {
            status.textContent = message;
            status.style.color = isError ? 'var(--danger)' : 'var(--success)';
        }
    }

    function closeLogoutConfirmation() {
        document.querySelector('[data-logout-modal]')?.remove();
    }

    function openLogoutConfirmation() {
        closeLogoutConfirmation();
        document.querySelector('[data-mobile-header-menu]')?.classList.remove('open');
        document.querySelector('[data-mobile-header-toggle]')?.setAttribute('aria-expanded', 'false');

        const modal = document.createElement('div');
        modal.className = 'auth-modal-backdrop';
        modal.dataset.logoutModal = 'true';
        modal.innerHTML = `<div class="auth-modal" role="alertdialog" aria-modal="true" aria-labelledby="logout-confirm-title" aria-describedby="logout-confirm-copy">
            <button class="icon-button auth-modal-close" type="button" data-logout-cancel aria-label="Close">x</button>
            <span class="badge warning">Account session</span>
            <h2 id="logout-confirm-title">Log out?</h2>
            <p class="muted" id="logout-confirm-copy">You will need your password and login code to sign in again.</p>
            <div class="logout-confirm-actions">
                <button class="button" type="button" data-logout-cancel>Cancel</button>
                <button class="button danger" type="button" data-logout-confirm>Log out</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        modal.querySelector('[data-logout-confirm]')?.focus();
    }

    async function performLogout(button) {
        button.disabled = true;
        button.textContent = 'Logging out...';
        try {
            await apiFetch('/api/auth/logout', { method: 'POST' });
        } catch (error) {
            // Local token removal is still correct if the server session is already gone.
        }
        localStorage.removeItem('security_platform_token');
        window.location.href = '/sign-in';
    }

    document.addEventListener('click', async function (event) {
        const logoutRequest = event.target.closest('[data-logout-request]');
        const logoutConfirm = event.target.closest('[data-logout-confirm]');
        const logoutCancel = event.target.closest('[data-logout-cancel]');
        const logoutModal = event.target.closest('[data-logout-modal]');

        if (logoutRequest) {
            openLogoutConfirmation();
            return;
        }

        if (logoutConfirm) {
            await performLogout(logoutConfirm);
            return;
        }

        if (logoutCancel || (logoutModal && event.target === logoutModal)) {
            closeLogoutConfirmation();
        }
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            closeLogoutConfirmation();
        }
    });

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, function (char) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char];
        });
    }

    function githubIcon() {
        return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5A11.5 11.5 0 0 0 8.36 22.9c.58.1.79-.25.79-.56v-2.02c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.05-.72.08-.7.08-.7 1.17.08 1.79 1.2 1.79 1.2 1.04 1.78 2.73 1.27 3.4.97.1-.75.4-1.27.73-1.56-2.55-.3-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.2-3.08-.12-.3-.52-1.51.12-3.04 0 0 .98-.31 3.2 1.18a11.1 11.1 0 0 1 5.82 0c2.22-1.5 3.2-1.18 3.2-1.18.64 1.53.24 2.74.12 3.04.75.8 1.2 1.83 1.2 3.08 0 4.42-2.7 5.38-5.26 5.67.42.36.78 1.06.78 2.14v3.15c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"/></svg>';
    }

    function detectBrowser(userAgent) {
        if (/Brave\//.test(userAgent)) {
            return { name: 'Brave', icon: logoSvg('brave') };
        }
        if (/OPR\/|Opera\//.test(userAgent)) {
            return { name: 'Opera', icon: logoSvg('opera') };
        }
        if (/Edg\//.test(userAgent)) {
            return { name: 'Edge', icon: logoSvg('edge') };
        }
        if (/Firefox\//.test(userAgent)) {
            return { name: 'Firefox', icon: logoSvg('firefox') };
        }
        if (/Chrome\//.test(userAgent) && !/Chromium\//.test(userAgent)) {
            return { name: 'Chrome', icon: logoSvg('chrome') };
        }
        if (/Chromium\//.test(userAgent)) {
            return { name: 'Chromium', icon: logoSvg('chromium') };
        }
        if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) {
            return { name: 'Safari', icon: logoSvg('safari') };
        }

        return { name: 'Browser', icon: logoSvg('browser') };
    }

    function detectPlatform(userAgent) {
        if (/Windows NT/i.test(userAgent)) {
            return { name: 'Windows', icon: logoSvg('windows') };
        }
        if (/Ubuntu/i.test(userAgent)) {
            return { name: 'Ubuntu', icon: logoSvg('ubuntu') };
        }
        if (/Android/i.test(userAgent)) {
            return { name: 'Android', icon: logoSvg('android') };
        }
        if (/iPhone|iPad|iPod/i.test(userAgent)) {
            return { name: 'iOS', icon: logoSvg('apple') };
        }
        if (/Macintosh|Mac OS X/i.test(userAgent)) {
            return { name: 'macOS', icon: logoSvg('apple') };
        }
        if (/Linux|X11/i.test(userAgent)) {
            return { name: 'Linux', icon: logoSvg('linux') };
        }

        return { name: 'Device', icon: logoSvg('device') };
    }

    function logoSvg(name) {
        const localPngLogos = {
            chrome: 'chrome.png',
            chromium: 'chromium.png',
            edge: 'edge.png',
            firefox: 'firefox.png',
            safari: 'safari.png',
            opera: 'opera.png',
            brave: 'brave.png',
            windows: 'windows.png',
            apple: 'apple.png',
            linux: 'linux.png',
            ubuntu: 'ubuntu.png',
            android: 'android.png'
        };
        const fallbackLogos = {
            browser: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c2.2 2.4 3.3 5.4 3.3 9S14.2 18.6 12 21c-2.2-2.4-3.3-5.4-3.3-9S9.8 5.4 12 3Z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
            device: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 9h8M8 13h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
        };

        if (localPngLogos[name]) {
            const fileName = localPngLogos[name];
            const label = escapeHtml(name);

            return `<img src="/public/images/session-logos/${fileName}" alt="" width="28" height="28" loading="lazy" data-session-logo="${label}">`;
        }

        return fallbackLogos[name] || fallbackLogos.browser;
    }

    function getGithubRepositoryUrl(repo) {
        const webUrl = String(repo.webUrl || '');

        try {
            const parsed = new URL(webUrl);
            if (parsed.protocol === 'https:' && parsed.hostname === 'github.com') {
                return parsed.href;
            }
        } catch (error) {
            // Fall back to fullName below.
        }

        const fullName = String(repo.fullName || '');
        if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) {
            const [owner, name] = fullName.split('/');
            return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
        }

        return '';
    }

    function formatDate(value) {
        if (!value) {
            return '-';
        }

        return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function formatDateTime(value) {
        if (!value) {
            return '-';
        }

        return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
})();
