package audit

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgxpool"
)

type AuditLogger struct {
	pool *pgxpool.Pool
}

func NewAuditLogger(pool *pgxpool.Pool) *AuditLogger {
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
	detailsJSON, _ := json.Marshal(details)

	_, err := l.pool.Exec(ctx,
		`INSERT INTO audit_log (user_id, action, resource_type, resource_id, details, ip_address, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, now())`,
		userID, action, resourceType, resourceID, detailsJSON, remoteAddrFromContext(ctx),
	)
	return err
}

func remoteAddrFromContext(ctx context.Context) string {
	if addr, ok := ctx.Value("remote_addr").(string); ok {
		return addr
	}
	return ""
}
