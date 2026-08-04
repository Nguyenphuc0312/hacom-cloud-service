package auth

import "errors"

var (
	ErrCredentialsRequired    = errors.New("access token is required")
	ErrTokenInvalid           = errors.New("access token is invalid")
	ErrTokenExpired           = errors.New("access token has expired")
	ErrTokenRevoked           = errors.New("access token has been revoked")
	ErrAuthAuthorityUnready   = errors.New("authentication authority is unavailable")
	ErrSigningKeyNotFound     = errors.New("JWT signing key was not found")
	ErrSigningKeysUnavailable = errors.New("JWT signing keys are unavailable")
)
