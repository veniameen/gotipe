package handler

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/billing"
	"github.com/gotipe/cloud/internal/storage"
)

// A durable pending usage row reserves a slot before any billable provider call.
// Crashed requests stop reserving after 15 minutes (providers time out in 2 min).
func (h *AIHandler) reserveAI(ctx context.Context, user *auth.UserContext) (string, error) {
	id := uuid.NewString()
	err := storage.WithUserLock(ctx, h.db.Pool, user.UserID, func(tx storage.Database) error {
		var count int64
		if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM usage_logs WHERE user_id=$1
   AND created_at>=date_trunc('month',now()) AND (action='ai.request'
   OR (action='ai.pending' AND created_at>now()-interval '15 minutes'))`, user.UserID).Scan(&count); err != nil {
			return err
		}
		if !billing.CheckAIQuota(user.Plan, count) {
			return billing.ErrQuotaExceeded
		}
		_, err := tx.Exec(ctx, `INSERT INTO usage_logs(user_id,action,resource_type,resource_id,created_at)
   VALUES($1,'ai.pending','ai',$2,now())`, user.UserID, id)
		return err
	})
	return id, err
}

func (h *AIHandler) releaseAI(ctx context.Context, userID, id string) {
	cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	_, _ = h.db.Pool.Exec(cleanup, `DELETE FROM usage_logs WHERE user_id=$1 AND resource_id=$2 AND action='ai.pending'`, userID, id)
}
