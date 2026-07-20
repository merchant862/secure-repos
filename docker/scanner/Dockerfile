FROM golang:1.24-bookworm AS go-tools

ARG GITLEAKS_VERSION=8.21.2
ARG TRUFFLEHOG_VERSION=3.88.23
ARG OSV_SCANNER_VERSION=2.0.3

RUN go install github.com/gitleaks/gitleaks/v8@v${GITLEAKS_VERSION} \
    && go install github.com/trufflesecurity/trufflehog/v3@v${TRUFFLEHOG_VERSION} \
    && go install github.com/google/osv-scanner/v2/cmd/osv-scanner@v${OSV_SCANNER_VERSION}

FROM python:3.12-slim

ARG TRIVY_VERSION=0.58.2
ARG SYFT_VERSION=1.18.1
ARG GRYPE_VERSION=0.85.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git jq coreutils \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir semgrep==1.103.0 checkov==3.2.341

RUN curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh \
        | sh -s -- -b /usr/local/bin "v${TRIVY_VERSION}" \
    && curl -sfL https://raw.githubusercontent.com/anchore/syft/main/install.sh \
        | sh -s -- -b /usr/local/bin "v${SYFT_VERSION}" \
    && curl -sfL https://raw.githubusercontent.com/anchore/grype/main/install.sh \
        | sh -s -- -b /usr/local/bin "v${GRYPE_VERSION}"

COPY --from=go-tools /go/bin/gitleaks /usr/local/bin/gitleaks
COPY --from=go-tools /go/bin/trufflehog /usr/local/bin/trufflehog
COPY --from=go-tools /go/bin/osv-scanner /usr/local/bin/osv-scanner
COPY run-scanners.sh /usr/local/bin/run-scanners
RUN chmod +x /usr/local/bin/run-scanners

WORKDIR /workspace/repo
ENTRYPOINT ["/usr/local/bin/run-scanners"]
