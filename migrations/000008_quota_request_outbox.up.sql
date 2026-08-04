BEGIN;

CREATE TABLE cloud.outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type VARCHAR(64) NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type VARCHAR(96) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,

  CONSTRAINT cloud_outbox_aggregate_type_not_blank_chk
    CHECK (btrim(aggregate_type) <> ''),
  CONSTRAINT cloud_outbox_event_type_not_blank_chk
    CHECK (btrim(event_type) <> ''),
  CONSTRAINT cloud_outbox_payload_object_chk
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT cloud_outbox_attempts_chk
    CHECK (attempts >= 0),
  CONSTRAINT cloud_outbox_publish_state_chk
    CHECK (published_at IS NULL OR last_error IS NULL),
  CONSTRAINT cloud_outbox_event_aggregate_uq
    UNIQUE (event_type, aggregate_id)
);

CREATE INDEX cloud_outbox_pending_idx
  ON cloud.outbox_events (available_at, occurred_at, id)
  WHERE published_at IS NULL;

COMMENT ON TABLE cloud.outbox_events IS
  'Transactional integration boundary; a publisher is intentionally not enabled until notification integration is contracted';
COMMENT ON COLUMN cloud.outbox_events.payload IS
  'Minimal event data only; quota-request reason is deliberately excluded';

COMMIT;
