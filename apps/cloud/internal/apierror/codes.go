package apierror

import (
	"encoding/json"
	"net/http"
)

type APIError struct {
	Code    string      `json:"code"`
	Message string      `json:"message"`
	Details interface{} `json:"details,omitempty"`
	Status  int         `json:"-"`
}

func (e *APIError) Error() string {
	return e.Message
}

func (e *APIError) WithDetails(details interface{}) *APIError {
	return &APIError{
		Code:    e.Code,
		Message: e.Message,
		Details: details,
		Status:  e.Status,
	}
}

func (e *APIError) WithMessage(msg string) *APIError {
	return &APIError{
		Code:    e.Code,
		Message: msg,
		Details: e.Details,
		Status:  e.Status,
	}
}

// Write writes the error as JSON response
func (e *APIError) Write(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(e.Status)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error": e,
	})
}

// Predefined errors
var (
	ErrInvalidJSON   = &APIError{Code: "INVALID_JSON", Message: "Request body is not valid JSON", Status: 400}
	ErrValidation    = &APIError{Code: "VALIDATION_ERROR", Message: "Request validation failed", Status: 400}
	ErrUnauthorized  = &APIError{Code: "UNAUTHORIZED", Message: "Missing or invalid authentication", Status: 401}
	ErrInvalidAPIKey = &APIError{Code: "INVALID_API_KEY", Message: "API key is invalid or expired", Status: 401}
	ErrInvalidToken  = &APIError{Code: "INVALID_TOKEN", Message: "JWT token is invalid or expired", Status: 401}
	ErrForbidden     = &APIError{Code: "FORBIDDEN", Message: "Insufficient permissions", Status: 403}
	ErrNotFound      = &APIError{Code: "NOT_FOUND", Message: "Resource not found", Status: 404}
	ErrConflict      = &APIError{Code: "CONFLICT", Message: "Resource already exists", Status: 409}
	ErrQuotaExceeded = &APIError{Code: "QUOTA_EXCEEDED", Message: "Plan limit reached", Status: 402}
	ErrRateLimited   = &APIError{Code: "RATE_LIMITED", Message: "Too many requests", Status: 429}
	ErrInternal      = &APIError{Code: "INTERNAL_ERROR", Message: "Internal server error", Status: 500}
	ErrServiceDown   = &APIError{Code: "SERVICE_UNAVAILABLE", Message: "Service temporarily unavailable", Status: 503}
)

// WriteJSON helper for success responses
func WriteJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
