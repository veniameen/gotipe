package sync

import (
	"context"
	"errors"
	"time"

	"github.com/gorilla/websocket"
	"github.com/gotipe/cloud/internal/auth"
)

type AuthorizationCheck func(context.Context, *auth.UserContext, string) error

// SetAuthorizationCheck installs the host's live credential/document check.
// Configure it before accepting connections; each connection retains its checker.
func (s *Server) SetAuthorizationCheck(check AuthorizationCheck) {
	s.mu.Lock()
	s.authorize = check
	s.mu.Unlock()
}

func (c *Client) checkAuthorization() error {
	if !c.expiresAt.IsZero() && !time.Now().Before(c.expiresAt) {
		return errors.New("collaboration credential expired")
	}
	if c.authorize == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return c.authorize(ctx)
}
func (c *Client) closeUnauthorized() {
	if c.conn != nil {
		_ = c.conn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "Collaboration access expired or was revoked"), time.Now().Add(time.Second))
	}
}
