//go:build integration

package handler

import (
	"context"
	"encoding/json"
	"github.com/go-chi/chi/v5"
	"github.com/gotipe/cloud/internal/audit"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/testdb"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func apiRequest(method, path, body string, user *auth.UserContext, params map[string]string) *http.Request {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r = r.WithContext(auth.WithUser(r.Context(), user))
	route := chi.NewRouteContext()
	for key, value := range params {
		route.URLParams.Add(key, value)
	}
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, route))
}

func TestUserAndOrganizationContractsAgainstPostgres(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	var userID string
	if err := db.Pool.QueryRow(ctx, `INSERT INTO users(email,avatar_url)VALUES('owner@test.invalid',NULL)RETURNING id`).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	user := &auth.UserContext{UserID: userID, Plan: "free"}
	w := httptest.NewRecorder()
	NewUsersHandler(db).GetMe()(w, apiRequest("GET", "/v1/users/me", "", user, nil))
	if w.Code != 200 {
		t.Fatalf("nullable avatar or timestamptz scan failed: %d %s", w.Code, w.Body.String())
	}
	var me UserResponse
	if err := json.Unmarshal(w.Body.Bytes(), &me); err != nil {
		t.Fatal(err)
	}
	if me.CreatedAt.IsZero() {
		t.Fatal("missing account timestamp")
	}
	orgs := NewOrganizationsHandler(db, audit.NewAuditLogger(db.Pool))
	w = httptest.NewRecorder()
	orgs.CreateOrganization()(w, apiRequest("POST", "/v1/organizations", `{"name":"Test","slug":"test-org"}`, user, nil))
	if w.Code != 201 {
		t.Fatalf("create organization: %d %s", w.Code, w.Body.String())
	}
	var organization OrgResponse
	if err := json.Unmarshal(w.Body.Bytes(), &organization); err != nil {
		t.Fatal(err)
	}
	var role string
	if err := db.Pool.QueryRow(ctx, `SELECT role FROM org_members WHERE org_id=$1 AND user_id=$2`, organization.ID, userID).Scan(&role); err != nil || role != "admin" {
		t.Fatalf("owner membership missing role=%s err=%v", role, err)
	}
	w = httptest.NewRecorder()
	orgs.AddMember()(w, apiRequest("POST", "/members", `{"email":"owner@test.invalid","role":"viewer"}`, user, map[string]string{"id": organization.ID}))
	if w.Code != 403 {
		t.Fatalf("owner demotion accepted: %d", w.Code)
	}
	if err := db.Pool.QueryRow(ctx, `SELECT role FROM org_members WHERE org_id=$1 AND user_id=$2`, organization.ID, userID).Scan(&role); err != nil || role != "admin" {
		t.Fatal("owner role changed")
	}
}

func TestRealDocumentPermissionsProtectContentCommentsAndVersions(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	var ownerID, viewerID, otherID, docID string
	for i, email := range []string{"owner@test.invalid", "viewer@test.invalid", "other@test.invalid"} {
		var id string
		if err := db.Pool.QueryRow(ctx, `INSERT INTO users(email)VALUES($1)RETURNING id`, email).Scan(&id); err != nil {
			t.Fatal(err)
		}
		switch i {
		case 0:
			ownerID = id
		case 1:
			viewerID = id
		case 2:
			otherID = id
		}
	}
	if err := db.Pool.QueryRow(ctx, `INSERT INTO documents(owner_id,r2_key)VALUES($1,'content')RETURNING id`, ownerID).Scan(&docID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Pool.Exec(ctx, `INSERT INTO document_permissions(document_id,user_id,role)VALUES($1,$2,'viewer')`, docID, viewerID); err != nil {
		t.Fatal(err)
	}
	objects := &memoryObjects{data: map[string][]byte{"content": []byte(`{"blocks":[],"version":1}`)}}
	documents := NewDocumentsHandler(db, objects, audit.NewAuditLogger(db.Pool))
	comments := NewCommentsHandler(db, audit.NewAuditLogger(db.Pool))
	versions := NewVersionsHandler(db, objects, audit.NewAuditLogger(db.Pool))
	for _, test := range []struct {
		name    string
		handler http.HandlerFunc
		user    string
		want    int
		body    string
	}{
		{"shared read", documents.GetDocument(), viewerID, 200, ""},
		{"stranger read", documents.GetDocument(), otherID, 404, ""},
		{"viewer comment", comments.CreateComment(), viewerID, 404, `{"content":"not allowed"}`},
		{"stranger versions", versions.ListVersions(), otherID, 404, ""},
	} {
		t.Run(test.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			test.handler(w, apiRequest("POST", "/v1/documents/"+docID, test.body, &auth.UserContext{UserID: test.user, Plan: "free", ExpiresAt: time.Now().Add(time.Hour)}, map[string]string{"id": docID, "docId": docID}))
			if w.Code != test.want {
				t.Fatalf("status%d body%s", w.Code, w.Body.String())
			}
		})
	}
}
