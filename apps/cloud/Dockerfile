# Multi-stage build for GoTipe Cloud API
# Stage 1: Build
FROM golang:1.23-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /app

# Cache dependencies
COPY go.mod go.sum ./
RUN go mod download

# Build
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s" \
    -o /app/api ./cmd/api

# Stage 2: Runtime
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata

# Create non-root user
RUN addgroup -S gotipe && adduser -S gotipe -G gotipe

WORKDIR /app

COPY --from=builder /app/api .
COPY --from=builder /app/migrations ./migrations

USER gotipe

EXPOSE 8080 8081 9090

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/healthz || exit 1

ENTRYPOINT ["/app/api"]
