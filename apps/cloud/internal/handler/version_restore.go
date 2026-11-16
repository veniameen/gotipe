package handler

import (
	"errors"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/gotipe/cloud/internal/apierror"
	"github.com/gotipe/cloud/internal/audit"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/jackc/pgx/v5"
	"net/http"
)

// RestoreVersion stages immutable objects and changes the document pointer only
// after preserving the pre-restore content. Failed database writes leave it intact.
func (h *VersionsHandler) RestoreVersion() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		versionID, valid := pathUUID(w, r, "versionId")
		if !valid {
			return
		}
		docID := chi.URLParam(r, "docId")
		if !requireDocumentAccess(w, r, h.db.Pool, docID, "editor") {
			return
		}
		user := auth.UserFromContext(r.Context())
		var snapshotKey string
		err := h.db.Pool.QueryRow(r.Context(), `SELECT snapshot_key FROM versions WHERE id = $1 AND document_id = $2`, versionID, docID).Scan(&snapshotKey)
		if errors.Is(err, pgx.ErrNoRows) {
			apierror.ErrNotFound.Write(w)
			return
		}
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}
		content, err := h.r2.Get(r.Context(), snapshotKey)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}
		var currentKey string
		var currentVersion int64
		err = h.db.Pool.QueryRow(r.Context(), `SELECT r2_key, version FROM documents WHERE id = $1`, docID).Scan(&currentKey, &currentVersion)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}
		previous, err := h.contents.Load(r.Context(), docID, currentKey)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}
		restoreID := uuid.NewString()
		restoreKey := "versions/" + docID + "/" + restoreID + ".json"
		newKey := "documents/" + docID + "/" + uuid.NewString() + ".json"
		if err = h.r2.Put(r.Context(), restoreKey, previous); err != nil {
			apierror.ErrInternal.Write(w)
			return
		}
		if err = h.r2.Put(r.Context(), newKey, content); err != nil {
			_ = h.r2.Delete(r.Context(), restoreKey)
			apierror.ErrInternal.Write(w)
			return
		}
		// Optimistic version check avoids overwriting a concurrent edit. The CTE only
		// inserts the undo version when the document pointer was successfully changed.
		result, err := h.db.Pool.Exec(r.Context(), `WITH restored AS (
    UPDATE documents SET r2_key=$1, version=version+1, size_bytes=$2, updated_at=now()
    WHERE id=$3 AND version=$4 RETURNING id
  ) , removed_updates AS (DELETE FROM document_updates USING restored WHERE document_id = restored.id),
    removed_snapshots AS (DELETE FROM document_snapshots USING restored WHERE document_id = restored.id)
    INSERT INTO versions (id,document_id,name,version_type,created_by,snapshot_key,size_bytes,created_at)
    SELECT $5,id,$6,'restore_point',$7,$8,$9,now() FROM restored`,
			newKey, len(content), docID, currentVersion, restoreID, "Before restoring: "+versionID, user.UserID, restoreKey, len(previous))
		if err != nil || result.RowsAffected() == 0 {
			_ = h.r2.Delete(r.Context(), newKey)
			_ = h.r2.Delete(r.Context(), restoreKey)
			if err != nil {
				apierror.ErrInternal.Write(w)
			} else {
				apierror.ErrConflict.WithMessage("Document changed during restore").Write(w)
			}
			return
		}
		h.replaced.after(docID)
		_ = h.audit.Log(r.Context(), user.UserID, audit.ActionVersionRestore, "version", versionID, map[string]string{"document_id": docID})
		apierror.WriteJSON(w, http.StatusOK, map[string]string{"status": "restored", "version_id": restoreID})
	}
}
