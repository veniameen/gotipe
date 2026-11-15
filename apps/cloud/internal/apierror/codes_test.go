package apierror

import (
	"encoding/json"
	"net/http/httptest"
	"reflect"
	"testing"
)

// The SDK, openapi.yaml and docs-site/cloud promise exactly this body: the error has a
// code and a message and nothing else (D-170).
func TestWriteSendsOnlyCodeAndMessage(t *testing.T) {
	recorder := httptest.NewRecorder()
	ErrNotFound.WithMessage("Document not found").Write(recorder)
	if recorder.Code != 404 {
		t.Fatalf("status %d, want 404", recorder.Code)
	}
	var body map[string]map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	want := map[string]map[string]any{"error": {"code": "NOT_FOUND", "message": "Document not found"}}
	if !reflect.DeepEqual(body, want) {
		t.Fatalf("body %v, want %v", body, want)
	}
}
