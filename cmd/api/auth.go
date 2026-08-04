package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/auth"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/config"
	"github.com/redis/go-redis/v9"
)

func buildAuthenticator(cfg config.Config) (auth.Authenticator, io.Closer, error) {
	switch cfg.AuthMode {
	case "demo":
		return auth.DemoAuthenticator{}, nil, nil
	case "jwt":
		return buildJWTAuthenticator(cfg)
	default:
		return nil, nil, fmt.Errorf("unsupported auth mode %q", cfg.AuthMode)
	}
}

func buildAdminServiceAuthenticator(cfg config.Config) (auth.Authenticator, error) {
	if cfg.AuthMode == "demo" {
		return auth.DemoServiceAuthenticator{Token: cfg.DemoAdminServiceToken}, nil
	}
	httpClient := &http.Client{Timeout: cfg.AuthHTTPTimeout}
	jwks, err := auth.NewRemoteJWKS(cfg.AuthJWKSURL, httpClient, cfg.AuthJWKSCacheTTL)
	if err != nil {
		return nil, fmt.Errorf("create admin service-token JWKS client: %w", err)
	}
	warmCtx, cancel := context.WithTimeout(context.Background(), cfg.AuthHTTPTimeout)
	defer cancel()
	if err = jwks.Warm(warmCtx); err != nil {
		return nil, errors.New("Auth JWKS is unavailable for admin service-token verification")
	}
	return auth.NewServiceTokenAuthenticator(jwks, cfg.AuthIssuer, cfg.InternalServiceTokenAudience, cfg.InternalServiceTokenScope)
}

func buildJWTAuthenticator(cfg config.Config) (auth.Authenticator, io.Closer, error) {
	httpClient := &http.Client{
		Timeout: cfg.AuthHTTPTimeout,
		CheckRedirect: func(request *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return errors.New("too many JWKS redirects")
			}
			original, err := url.Parse(cfg.AuthJWKSURL)
			if err != nil || request.URL.Host != original.Host || request.URL.Scheme != original.Scheme {
				return errors.New("cross-origin JWKS redirect is not allowed")
			}
			return nil
		},
	}
	jwks, err := auth.NewRemoteJWKS(cfg.AuthJWKSURL, httpClient, cfg.AuthJWKSCacheTTL)
	if err != nil {
		return nil, nil, fmt.Errorf("create JWKS client: %w", err)
	}
	verifier, err := auth.NewTokenVerifier(jwks, auth.VerifierConfig{
		Issuer:             cfg.AuthIssuer,
		Audiences:          cfg.AuthAudiences,
		Leeway:             30 * time.Second,
		LegacyHS256Enabled: cfg.AuthLegacyHS256Enabled,
		LegacyHS256Secret:  []byte(cfg.AuthLegacyHS256Secret),
	})
	if err != nil {
		return nil, nil, fmt.Errorf("create token verifier: %w", err)
	}

	redisOptions, err := redis.ParseURL(cfg.AuthRedisURL)
	if err != nil {
		return nil, nil, fmt.Errorf("parse auth Redis URL: %w", err)
	}
	redisClient := redis.NewClient(redisOptions)
	pingCtx, cancelPing := context.WithTimeout(context.Background(), cfg.AuthHTTPTimeout)
	if err := redisClient.Ping(pingCtx).Err(); err != nil {
		cancelPing()
		_ = redisClient.Close()
		return nil, nil, errors.New("auth revocation Redis is unavailable")
	}
	cancelPing()
	if !cfg.AuthLegacyHS256Enabled {
		jwksCtx, cancelJWKS := context.WithTimeout(context.Background(), cfg.AuthHTTPTimeout)
		err := jwks.Warm(jwksCtx)
		cancelJWKS()
		if err != nil {
			_ = redisClient.Close()
			return nil, nil, errors.New("Auth JWKS is unavailable or contains no usable keys")
		}
	}

	store, err := auth.NewRedisStore(redisClient)
	if err != nil {
		_ = redisClient.Close()
		return nil, nil, fmt.Errorf("create revocation store: %w", err)
	}
	revocation, err := auth.NewRedisRevocationChecker(store, cfg.AuthRevocationTimeout)
	if err != nil {
		_ = redisClient.Close()
		return nil, nil, fmt.Errorf("create revocation checker: %w", err)
	}
	authorityHTTPClient := &http.Client{
		Timeout: cfg.AuthHTTPTimeout,
	}
	authority, err := auth.NewAuthorityClient(auth.AuthorityClientConfig{
		ServiceTokenURL:         cfg.AuthServiceTokenURL,
		AccountStateURL:         cfg.AuthAccountStateURL,
		VerificationContractURL: cfg.AuthVerificationContractURL,
		ClientID:                cfg.AuthServiceClientID,
		ClientSecret:            cfg.AuthServiceClientSecret,
		Audience:                cfg.AuthServiceTokenAudience,
		Scopes:                  cfg.AuthServiceTokenScopes,
		ExpectedJWKSURL:         cfg.AuthJWKSURL,
		ExpectedIssuer:          cfg.AuthIssuer,
		ExpectedAudiences:       cfg.AuthAudiences,
	}, authorityHTTPClient)
	if err != nil {
		_ = redisClient.Close()
		return nil, nil, fmt.Errorf("create Auth account authority: %w", err)
	}
	contractCtx, cancelContract := context.WithTimeout(context.Background(), cfg.AuthHTTPTimeout)
	err = authority.ValidateVerificationContract(contractCtx)
	cancelContract()
	if err != nil {
		_ = redisClient.Close()
		return nil, nil, errors.New("Auth verification contract is unavailable or does not match Cloud configuration")
	}
	authenticator, err := auth.NewJWTAuthenticator(verifier, revocation, authority)
	if err != nil {
		_ = redisClient.Close()
		return nil, nil, fmt.Errorf("create JWT authenticator: %w", err)
	}
	return authenticator, redisClient, nil
}
