package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/gotipe/cloud/internal/apierror"
	"github.com/gotipe/cloud/internal/audit"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/billing"
	"github.com/gotipe/cloud/internal/config"
	"github.com/gotipe/cloud/internal/handler"
	"github.com/gotipe/cloud/internal/logger"
	"github.com/gotipe/cloud/internal/middleware"
	"github.com/gotipe/cloud/internal/storage"
	"github.com/gotipe/cloud/internal/sync"
	"github.com/gotipe/cloud/internal/worker"
)

func main() {
	// Load config
	cfg, err := config.Load()
	if err != nil {
		panic("failed to load config: " + err.Error())
	}

	// Setup logger
	log := logger.Setup(cfg.LogLevel, cfg.LogFormat)
	slog.SetDefault(log)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// --- Phase 1: Initialize storage ---
	log.Info("initializing storage")

	db, err := storage.NewPostgresStore(ctx, cfg.DatabaseURL, cfg.DBMaxConns, cfg.DBIdleConns)
	if err != nil {
		log.Error("failed to connect to postgres", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	valkeyStore, err := storage.NewValkeyStore(cfg.ValkeyURL, cfg.ValkeyPassword)
	if err != nil {
		log.Error("failed to connect to valkey", "error", err)
		os.Exit(1)
	}
	defer valkeyStore.Close()

	r2, err := storage.NewR2Store(ctx, cfg.R2AccountID, cfg.R2AccessKeyID, cfg.R2SecretKey,
		cfg.R2Bucket, cfg.R2CDNUrl, cfg.S3Endpoint, cfg.S3UsePathStyle)
	if err != nil {
		log.Error("failed to connect to r2/s3", "error", err)
		os.Exit(1)
	}

	// --- Phase 2: Initialize services ---
	log.Info("initializing services")

	jwtSvc, err := auth.NewJWTService(cfg.JWTPrivateKeyPEM, cfg.JWTPublicKeyPEM, cfg.JWTIssuer, cfg.JWTAudience, cfg.JWTExpiry)
	if err != nil {
		log.Error("failed to initialize JWT service", "error", err)
		os.Exit(1)
	}

	apiKeySvc := auth.NewAPIKeyService(db.Pool)
	auditLogger := audit.NewAuditLogger(db.Pool)

	stripeClient := billing.NewStripeClient(cfg.StripeSecretKey)

	// Rate limiter
	apiLimit, apiWindow, _ := config.ParseRateLimit(cfg.RateLimitAPI)
	rateLimiter, err := middleware.NewRateLimiter(valkeyStore, apiLimit, apiWindow)
	if err != nil {
		log.Warn("failed to initialize rate limiter, continuing without", "error", err)
	}

	// --- Phase 3: Initialize handlers ---
	authHandler := handler.NewAuthHandler(db, jwtSvc, valkeyStore)
	usersHandler := handler.NewUsersHandler(db)
	apiKeysHandler := handler.NewAPIKeysHandler(db, auditLogger, cfg.Environment)
	documentsHandler := handler.NewDocumentsHandler(db, r2, auditLogger)
	commentsHandler := handler.NewCommentsHandler(db, auditLogger)
	versionsHandler := handler.NewVersionsHandler(db, r2, auditLogger)
	orgsHandler := handler.NewOrganizationsHandler(db, auditLogger)
	permsHandler := handler.NewPermissionsHandler(db, auditLogger)
	exportsHandler := handler.NewExportsHandler(db, r2, auditLogger)
	aiHandler := handler.NewAIHandler(db, valkeyStore, cfg.AIDefaultProvider, cfg.AIDefaultModel, cfg.AIMaxTokens)
	billingHandler := handler.NewBillingHandler(db, stripeClient, auditLogger, map[string]string{
		"starter":  cfg.StripePriceStarterID,
		"pro":      cfg.StripePriceProID,
		"business": cfg.StripePriceBusinessID,
	})
	webhooksHandler := handler.NewWebhooksHandler(db, cfg.StripeWebhookSecret, log)

	// --- Phase 4: Build router ---
	r := chi.NewRouter()

	// Middleware chain (order is critical)
	r.Use(middleware.RequestIDMiddleware)
	r.Use(middleware.LoggerMiddleware(log))
	r.Use(chiMiddleware.Recoverer)
	r.Use(middleware.CORSMiddleware([]string{"*"})) // Configure in production
	r.Use(middleware.CSPMiddleware)

	// Public routes
	r.Get("/healthz", handler.Healthz())
	r.Get("/readyz", handler.Readyz(db, valkeyStore, r2))
	r.Post("/v1/auth/token", authHandler.CreateToken())
	r.Post("/v1/webhooks/stripe", webhooksHandler.StripeWebhook())

	// Authenticated routes
	r.Group(func(r chi.Router) {
		r.Use(auth.AuthMiddleware(jwtSvc, apiKeySvc, valkeyStore))
		if rateLimiter != nil {
			r.Use(rateLimiter.Middleware())
		}
		r.Use(middleware.IdempotencyMiddleware(valkeyStore))

		// Auth
		r.Post("/v1/auth/revoke", authHandler.RevokeToken())

		// Users
		r.Get("/v1/users/me", usersHandler.GetMe())

		// API Keys
		r.Post("/v1/api-keys", apiKeysHandler.CreateAPIKey())
		r.Get("/v1/api-keys", apiKeysHandler.ListAPIKeys())
		r.Delete("/v1/api-keys/{id}", apiKeysHandler.DeleteAPIKey())

		// Documents
		r.Post("/v1/documents", documentsHandler.CreateDocument())
		r.Get("/v1/documents", documentsHandler.ListDocuments())
		r.Get("/v1/documents/{id}", documentsHandler.GetDocument())
		r.Patch("/v1/documents/{id}", documentsHandler.UpdateDocument())
		r.Delete("/v1/documents/{id}", documentsHandler.DeleteDocument())

		// Comments
		r.Post("/v1/documents/{docId}/comments", commentsHandler.CreateComment())
		r.Get("/v1/documents/{docId}/comments", commentsHandler.ListComments())
		r.Post("/v1/documents/{docId}/comments/{commentId}/replies", commentsHandler.ReplyToComment())
		r.Post("/v1/documents/{docId}/comments/{commentId}/resolve", commentsHandler.ResolveComment())
		r.Delete("/v1/documents/{docId}/comments/{commentId}", commentsHandler.DeleteComment())

		// Versions
		r.Post("/v1/documents/{docId}/versions", versionsHandler.CreateVersion())
		r.Get("/v1/documents/{docId}/versions", versionsHandler.ListVersions())
		r.Post("/v1/documents/{docId}/versions/{versionId}/restore", versionsHandler.RestoreVersion())

		// Permissions
		r.Get("/v1/documents/{docId}/permissions", permsHandler.ListPermissions())
		r.Put("/v1/documents/{docId}/permissions", permsHandler.SetPermission())
		r.Delete("/v1/documents/{docId}/permissions/{userId}", permsHandler.RevokePermission())

		// Organizations
		r.Post("/v1/organizations", orgsHandler.CreateOrganization())
		r.Get("/v1/organizations/{id}", orgsHandler.GetOrganization())
		r.Get("/v1/organizations/{id}/members", orgsHandler.ListMembers())
		r.Post("/v1/organizations/{id}/members", orgsHandler.AddMember())
		r.Delete("/v1/organizations/{id}/members/{userId}", orgsHandler.RemoveMember())

		// Exports
		r.Post("/v1/exports", exportsHandler.CreateExport())
		r.Get("/v1/exports/{id}", exportsHandler.GetExport())

		// AI
		r.Post("/v1/ai/complete", aiHandler.Complete())

		// Billing
		r.Post("/v1/billing/subscribe", billingHandler.CreateSubscription())
		r.Post("/v1/billing/cancel", billingHandler.CancelSubscription())
		r.Get("/v1/billing/usage", billingHandler.GetUsage())
	})

	// Not found handler
	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		apierror.ErrNotFound.Write(w)
	})

	// --- Phase 5: Initialize WebSocket sync server ---
	syncPersist := &dbPersistenceStore{db: db, r2: r2}
	syncServer := sync.NewServer(syncPersist, log)

	syncRouter := chi.NewRouter()
	syncRouter.Use(middleware.RequestIDMiddleware)
	syncRouter.Use(middleware.LoggerMiddleware(log))
	syncRouter.Use(auth.AuthMiddleware(jwtSvc, apiKeySvc, valkeyStore))
	syncRouter.Get("/sync", syncServer.HandleWebSocket())

	// --- Phase 6: Start background workers ---
	cleanupWorker := worker.NewCleanupWorker(db, r2, valkeyStore, log)
	go cleanupWorker.Start(ctx)

	retryWorker := worker.NewRetryWorker(db, log)
	go retryWorker.Start(ctx)

	exportWorker := worker.NewExportWorker(db, r2, log, cfg.ExportPollInterval, cfg.ExportR2Prefix)
	go exportWorker.Start(ctx)

	billingWorker := worker.NewBillingWorker(db, log)
	go billingWorker.Start(ctx)

	// --- Phase 7: Start HTTP servers ---
	apiServer := &http.Server{
		Addr:         cfg.ListenAddr,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	syncHTTPServer := &http.Server{
		Addr:    cfg.SyncListenAddr,
		Handler: syncRouter,
	}

	// Metrics server
	metricsRouter := chi.NewRouter()
	metricsRouter.Handle("/metrics", handler.MetricsHandler())
	metricsServer := &http.Server{
		Addr:    cfg.MetricsAddr,
		Handler: metricsRouter,
	}

	go func() {
		log.Info("API server listening", "addr", cfg.ListenAddr)
		if err := apiServer.ListenAndServe(); err != http.ErrServerClosed {
			log.Error("API server error", "error", err)
		}
	}()

	go func() {
		log.Info("Sync server listening", "addr", cfg.SyncListenAddr)
		if err := syncHTTPServer.ListenAndServe(); err != http.ErrServerClosed {
			log.Error("Sync server error", "error", err)
		}
	}()

	if cfg.PrometheusEnabled {
		go func() {
			log.Info("Metrics server listening", "addr", cfg.MetricsAddr)
			if err := metricsServer.ListenAndServe(); err != http.ErrServerClosed {
				log.Error("Metrics server error", "error", err)
			}
		}()
	}

	// --- Phase 8: Graceful shutdown ---
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	sig := <-quit
	log.Info("shutting down", "signal", sig.String())

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	// Phase 1: Drain HTTP connections
	log.Info("shutdown phase 1: draining HTTP")
	if err := apiServer.Shutdown(shutdownCtx); err != nil {
		log.Error("API server shutdown error", "error", err)
	}

	// Phase 2: Stop WebSocket sync
	log.Info("shutdown phase 2: stopping WebSocket sync")
	syncServer.Shutdown()
	if err := syncHTTPServer.Shutdown(shutdownCtx); err != nil {
		log.Error("Sync server shutdown error", "error", err)
	}

	// Phase 3: Stop background workers
	log.Info("shutdown phase 3: stopping workers")
	cancel() // Cancel context for all workers

	// Phase 4: Stop metrics
	log.Info("shutdown phase 4: stopping metrics")
	if cfg.PrometheusEnabled {
		metricsServer.Shutdown(shutdownCtx)
	}

	// Phase 5: Close DB and Valkey
	log.Info("shutdown phase 5: closing storage")
	// db.Close() and valkeyStore.Close() are deferred

	// Phase 6: Exit
	log.Info("shutdown complete")
}

// dbPersistenceStore implements sync.PersistenceStore
type dbPersistenceStore struct {
	db *storage.PostgresStore
	r2 *storage.R2Store
}

func (p *dbPersistenceStore) LoadDocument(ctx context.Context, documentID string) ([]byte, error) {
	var r2Key string
	err := p.db.Pool.QueryRow(ctx,
		`SELECT r2_key FROM documents WHERE id = $1`, documentID,
	).Scan(&r2Key)
	if err != nil {
		return nil, err
	}
	return p.r2.Get(ctx, r2Key)
}

func (p *dbPersistenceStore) SaveUpdate(ctx context.Context, documentID string, update []byte) error {
	_, err := p.db.Pool.Exec(ctx,
		`INSERT INTO document_updates (document_id, data, created_at) VALUES ($1, $2, now())`,
		documentID, update,
	)
	return err
}

func (p *dbPersistenceStore) SaveSnapshot(ctx context.Context, documentID string, snapshot []byte) error {
	var r2Key string
	err := p.db.Pool.QueryRow(ctx,
		`SELECT r2_key FROM documents WHERE id = $1`, documentID,
	).Scan(&r2Key)
	if err != nil {
		return err
	}
	if err := p.r2.Put(ctx, r2Key, snapshot); err != nil {
		return err
	}
	_, err = p.db.Pool.Exec(ctx,
		`UPDATE documents SET size_bytes = $1, updated_at = now() WHERE id = $2`,
		len(snapshot), documentID,
	)
	return err
}

// Ensure allowedOrigins are configured properly
func getAllowedOrigins(env string) []string {
	if env == "production" {
		return []string{
			"https://gotipe.com",
			"https://app.gotipe.com",
			"https://docs.gotipe.com",
		}
	}
	return []string{"*"}
}

func init() {
	// Silence unused import
	_ = strings.TrimPrefix
}
