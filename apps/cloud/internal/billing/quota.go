package billing

import "errors"

var ErrQuotaExceeded = errors.New("plan quota exceeded")
