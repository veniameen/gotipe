package document

import (
	"crypto/sha256"
	"encoding/hex"
)

// GenerationToken names one baseline of a document for collaboration clients.
// It is derived from the immutable object key in documents.r2_key, so replacing
// the content always changes it, and it reveals nothing about storage. Clients
// treat it as opaque: REST returns it, the sync handshake compares it.
func GenerationToken(key string) string {
	sum := sha256.Sum256([]byte("gotipe.generation/1\x00" + key))
	return hex.EncodeToString(sum[:16])
}

// MaterializationLimit bounds the baseline plus the stored collaboration records
// of one generation that a read applies. The sync server refuses a save that
// would pass it, so a document never becomes unreadable.
const MaterializationLimit = 60 << 20
