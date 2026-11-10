package audit

import (
	"context"
	"encoding/json"
	"log/slog"
	"net"

	"github.com/gotipe/cloud/internal/storage"
)

type AuditLogger struct {
	pool storage.Database
}

func NewAuditLogger(pool storage.Database) *AuditLogger {
	return &AuditLogger{pool: pool}
}

// Action constants
const (
	ActionDocumentCreate   = "document.create"
	ActionDocumentDelete   = "document.delete"
	ActionDocumentUpdate   = "document.update"
	ActionCommentAdd       = "comment.add"
	ActionCommentResolve   = "comment.resolve"
	ActionCommentDelete    = "comment.delete"
	ActionVersionCreate    = "version.create"
	ActionVersionRestore   = "version.restore"
	ActionPermissionChange = "permission.change"
	ActionBillingSubscribe = "billing.subscribe"
	ActionBillingCancel    = "billing.cancel"
	ActionAPIKeyCreate     = "apikey.create"
	ActionAPIKeyDelete     = "apikey.delete"
	ActionExportCreate     = "export.create"
	ActionOrgCreate        = "org.create"
	ActionOrgMemberAdd     = "org.member.add"
	ActionOrgMemberRemove  = "org.member.remove"
)

func (l *AuditLogger) Log(ctx context.Context, userID, action, resourceType, resourceID string, details interface{}) error {
	detailsJSON, err := json.Marshal(details)
	if err != nil {
		return err
	}

	_, err = l.pool.Exec(ctx,
		`INSERT INTO audit_log (user_id, action, resource_type, resource_id, details, ip_address, created_at)
		 VALUES ($1, $2, $3, $4, $5, NULLIF($6,''), now())`,
		userID, action, resourceType, resourceID, detailsJSON, remoteAddrFromContext(ctx),
	)
	if err != nil {
		slog.Error("audit event persistence failed", "action", action, "resource_type", resourceType, "error", err)
	}
	return err
}

type remoteAddressKey struct{}

func WithRemoteAddress(ctx context.Context, address string) context.Context {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		host = address
	}
	if net.ParseIP(host) == nil {
		host = ""
	}
	return context.WithValue(ctx, remoteAddressKey{}, host)
}

func remoteAddrFromContext(ctx context.Context) string {
	if addr, ok := ctx.Value(remoteAddressKey{}).(string); ok {
		return addr
	}
	return ""
}
