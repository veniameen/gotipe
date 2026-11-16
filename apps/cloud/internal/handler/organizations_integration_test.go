//go:build integration

package handler

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gotipe/cloud/internal/audit"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/testdb"
)

// An organization admin must not remove the owner under any spelling of the
// owner's UUID that PostgreSQL would read.
func TestOrganizationAdminCannotRemoveOwnerAgainstPostgres(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	newUser := func(email string) string {
		var id string
		if err := db.Pool.QueryRow(ctx, `INSERT INTO users(email) VALUES($1) RETURNING id`, email).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	ownerID, adminID, viewerID := newUser("owner@test.invalid"), newUser("admin@test.invalid"), newUser("viewer@test.invalid")
	owner := &auth.UserContext{UserID: ownerID, Plan: "free"}
	admin := &auth.UserContext{UserID: adminID, Plan: "free"}
	orgs := NewOrganizationsHandler(db, audit.NewAuditLogger(db.Pool))
	w := httptest.NewRecorder()
	orgs.CreateOrganization()(w, apiRequest("POST", "/v1/organizations", `{"name":"Owned","slug":"owned"}`, owner, nil))
	if w.Code != 201 {
		t.Fatalf("create organization: %d %s", w.Code, w.Body)
	}
	var organization OrgResponse
	if err := json.Unmarshal(w.Body.Bytes(), &organization); err != nil {
		t.Fatal(err)
	}
	for _, member := range []string{`{"email":"admin@test.invalid","role":"admin"}`, `{"email":"viewer@test.invalid","role":"viewer"}`} {
		w = httptest.NewRecorder()
		orgs.AddMember()(w, apiRequest("POST", "/members", member, owner, map[string]string{"id": organization.ID}))
		if w.Code != 201 {
			t.Fatalf("add member %s: %d %s", member, w.Code, w.Body)
		}
	}
	isMember := func(userID string) bool {
		var exists bool
		if err := db.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM org_members WHERE org_id=$1 AND user_id=$2)`, organization.ID, userID).Scan(&exists); err != nil {
			t.Fatal(err)
		}
		return exists
	}
	remove := func(orgID, userID string) int {
		w := httptest.NewRecorder()
		orgs.RemoveMember()(w, apiRequest("DELETE", "/members", "", admin, map[string]string{"id": orgID, "userId": userID}))
		return w.Code
	}
	for _, spelling := range []string{ownerID, strings.ToUpper(ownerID)} {
		if code := remove(organization.ID, spelling); code != 403 || !isMember(ownerID) {
			t.Fatalf("owner removed as %s: status %d, member %v", spelling, code, isMember(ownerID))
		}
	}
	if code := remove(strings.ToUpper(organization.ID), strings.ToUpper(ownerID)); code != 403 || !isMember(ownerID) {
		t.Fatalf("owner removed through an upper-case organization ID: %d", code)
	}
	for _, spelling := range []string{"{" + ownerID + "}", strings.ReplaceAll(ownerID, "-", ""), "urn:uuid:" + ownerID, "not-a-uuid"} {
		if code := remove(organization.ID, spelling); code != 400 || !isMember(ownerID) {
			t.Fatalf("non-canonical ID %s: status %d, owner member %v", spelling, code, isMember(ownerID))
		}
	}
	if code := remove(organization.ID, strings.ToUpper(viewerID)); code != 204 || isMember(viewerID) {
		t.Fatalf("viewer not removed: %d", code)
	}
	if code := remove(organization.ID, viewerID); code != 204 {
		t.Fatalf("repeated removal: %d", code)
	}
}
