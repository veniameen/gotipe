# Build from the repository root: docker build -f apps/cloud/Dockerfile .
FROM rust:1.93-bookworm AS converter
WORKDIR /source
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
RUN CARGO_BUILD_JOBS=2 cargo build --locked --release -p gotipe-export --features pdf,docx,cli --bin gotipe-convert

FROM golang:1.26.11-bookworm AS api
WORKDIR /source
COPY apps/cloud/go.mod apps/cloud/go.sum ./
RUN go mod download
COPY apps/cloud .
RUN GOMAXPROCS=2 CGO_ENABLED=0 go build -p 2 -trimpath -ldflags="-w -s" -o /api ./cmd/api

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata wget \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home gotipe
COPY --from=api /api /usr/local/bin/gotipe-cloud
COPY --from=converter /source/target/release/gotipe-convert /usr/local/bin/gotipe-convert
COPY LICENSE-MIT LICENSE-COMMERCIAL /usr/share/doc/gotipe/
COPY packages/export-wasm/THIRD_PARTY_NOTICES.md /usr/share/doc/gotipe/export-NOTICES.md
COPY packages/export-wasm/licenses /usr/share/doc/gotipe/licenses
COPY crates/gotipe-export/licenses /usr/share/doc/gotipe/licenses
COPY apps/cloud/licenses /usr/share/doc/gotipe/go-licenses
USER gotipe
WORKDIR /home/gotipe
EXPOSE 8080 8081 9090
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --quiet --output-document=/dev/null http://localhost:8080/readyz || exit 1
ENTRYPOINT ["/usr/local/bin/gotipe-cloud"]
