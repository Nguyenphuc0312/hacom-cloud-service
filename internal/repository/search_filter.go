package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
	"github.com/jackc/pgx/v5"
)

func appendListFilters(
	query string,
	args []any,
	filter cloud.ListFilter,
	alias string,
) (string, []any) {
	if filter.Query != "" {
		position := len(args) + 1
		query += fmt.Sprintf(` AND (
			%[1]s.search_vector @@ websearch_to_tsquery('simple', $%[2]d)
			OR %[1]s.search_text ILIKE '%%' || $%[2]d || '%%'
		)`, alias, position)
		args = append(args, filter.Query)
	}
	if filter.Type != "" {
		query += fmt.Sprintf(" AND %s.item_type = $%d", alias, len(args)+1)
		args = append(args, filter.Type)
	}
	if !filter.From.IsZero() {
		query += fmt.Sprintf(" AND %s.created_at >= $%d", alias, len(args)+1)
		args = append(args, filter.From)
	}
	if !filter.To.IsZero() {
		query += fmt.Sprintf(" AND %s.created_at <= $%d", alias, len(args)+1)
		args = append(args, filter.To)
	}
	return query, args
}

func setListStatementTimeout(ctx context.Context, tx pgx.Tx, timeout time.Duration) error {
	milliseconds := timeout.Milliseconds()
	if milliseconds < 1 {
		milliseconds = 1
	}
	if _, err := tx.Exec(
		ctx,
		`SELECT set_config('statement_timeout', $1, true)`,
		fmt.Sprintf("%dms", milliseconds),
	); err != nil {
		return fmt.Errorf("set list query timeout: %w", err)
	}
	return nil
}
