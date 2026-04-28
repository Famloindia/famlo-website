-- Famlo DB V2
-- Migration copy for Supabase CLI or manual SQL editor execution.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS user_profiles_v2 (
    user_id                  UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name             TEXT,
    avatar_url               TEXT,
    phone                    TEXT,
    email                    TEXT,
    date_of_birth            TEXT,
    gender                   TEXT,
    bio                      TEXT,
    home_city                TEXT,
    home_state               TEXT,
    preferred_language       TEXT,
    last_lat                 NUMERIC,
    last_lng                 NUMERIC,
    last_location_label      TEXT,
    location_permission      TEXT DEFAULT 'unknown',
    discovery_radius_km      INTEGER DEFAULT 25,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hosts (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID NOT NULL REFERENCES users(id),
    legacy_family_id            UUID UNIQUE,
    legacy_home_id              UUID,
    status                      TEXT NOT NULL DEFAULT 'draft',
    display_name                TEXT NOT NULL,
    slug                        TEXT UNIQUE,
    city                        TEXT,
    state                       TEXT,
    locality                    TEXT,
    address_private             TEXT,
    lat                         NUMERIC,
    lng                         NUMERIC,
    about                       TEXT,
    family_story                TEXT,
    family_composition          TEXT,
    languages                   TEXT[] DEFAULT '{}',
    amenities                   TEXT[] DEFAULT '{}',
    house_rules                 TEXT[] DEFAULT '{}',
    bathroom_type               TEXT,
    common_areas                TEXT[] DEFAULT '{}',
    max_guests                  INTEGER DEFAULT 1,
    pricing_mode                TEXT NOT NULL DEFAULT 'quarterly',
    price_morning               INTEGER DEFAULT 0,
    price_afternoon             INTEGER DEFAULT 0,
    price_evening               INTEGER DEFAULT 0,
    price_fullday               INTEGER DEFAULT 0,
    blocked_dates               TEXT[] DEFAULT '{}',
    active_quarters             TEXT[] DEFAULT '{}',
    platform_commission_pct     NUMERIC DEFAULT 18,
    host_discount_pct           NUMERIC DEFAULT 0,
    upi_id                      TEXT,
    bank_account_holder_name    TEXT,
    bank_account_number         TEXT,
    ifsc_code                   TEXT,
    bank_name                   TEXT,
    compliance_status           TEXT DEFAULT 'pending',
    is_featured                 BOOLEAN NOT NULL DEFAULT FALSE,
    is_accepting                BOOLEAN NOT NULL DEFAULT FALSE,
    published_at                TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hosts_user_id_idx ON hosts(user_id);
CREATE INDEX IF NOT EXISTS hosts_status_idx ON hosts(status);
CREATE INDEX IF NOT EXISTS hosts_city_state_idx ON hosts(city, state);

CREATE TABLE IF NOT EXISTS host_media (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id          UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    storage_provider TEXT NOT NULL DEFAULT 'cloudflare',
    storage_key      TEXT,
    media_url        TEXT NOT NULL,
    thumbnail_url    TEXT,
    blurhash         TEXT,
    width            INTEGER,
    height           INTEGER,
    alt_text         TEXT,
    media_type       TEXT NOT NULL DEFAULT 'image',
    is_primary       BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order       INTEGER NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(host_id, media_url)
);

CREATE INDEX IF NOT EXISTS host_media_host_id_idx ON host_media(host_id);

CREATE TABLE IF NOT EXISTS hommie_profiles_v2 (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID NOT NULL REFERENCES users(id),
    legacy_city_guide_id        UUID UNIQUE,
    legacy_hommie_id            UUID UNIQUE,
    status                      TEXT NOT NULL DEFAULT 'draft',
    display_name                TEXT NOT NULL,
    slug                        TEXT UNIQUE,
    city                        TEXT,
    state                       TEXT,
    locality                    TEXT,
    address_private             TEXT,
    lat                         NUMERIC,
    lng                         NUMERIC,
    bio                         TEXT,
    languages                   TEXT[] DEFAULT '{}',
    interests                   TEXT[] DEFAULT '{}',
    service_tags                TEXT[] DEFAULT '{}',
    vehicle_type                TEXT,
    vehicle_rate                NUMERIC DEFAULT 0,
    hourly_price                INTEGER DEFAULT 0,
    nightly_price               INTEGER DEFAULT 0,
    max_guests                  INTEGER DEFAULT 1,
    availability_mode           TEXT DEFAULT 'manual',
    is_available                BOOLEAN NOT NULL DEFAULT TRUE,
    platform_commission_pct     NUMERIC DEFAULT 18,
    host_discount_pct           NUMERIC DEFAULT 0,
    published_at                TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hommie_profiles_v2_user_id_idx ON hommie_profiles_v2(user_id);
CREATE INDEX IF NOT EXISTS hommie_profiles_v2_status_idx ON hommie_profiles_v2(status);
CREATE INDEX IF NOT EXISTS hommie_profiles_v2_city_state_idx ON hommie_profiles_v2(city, state);

CREATE TABLE IF NOT EXISTS hommie_media_v2 (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hommie_id        UUID NOT NULL REFERENCES hommie_profiles_v2(id) ON DELETE CASCADE,
    storage_provider TEXT NOT NULL DEFAULT 'cloudflare',
    storage_key      TEXT,
    media_url        TEXT NOT NULL,
    thumbnail_url    TEXT,
    blurhash         TEXT,
    width            INTEGER,
    height           INTEGER,
    alt_text         TEXT,
    media_type       TEXT NOT NULL DEFAULT 'image',
    is_primary       BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order       INTEGER NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(hommie_id, media_url)
);

CREATE TABLE IF NOT EXISTS gallery_posts_v2 (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_type       TEXT NOT NULL,
    owner_profile_id UUID NOT NULL,
    owner_user_id    UUID NOT NULL REFERENCES users(id),
    storage_provider TEXT NOT NULL DEFAULT 'cloudflare',
    storage_key      TEXT,
    media_url        TEXT NOT NULL,
    thumbnail_url    TEXT,
    caption          TEXT,
    visibility       TEXT NOT NULL DEFAULT 'public',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT gallery_posts_v2_owner_type_check CHECK (owner_type IN ('host', 'hommie')),
    UNIQUE(owner_type, owner_profile_id, media_url)
);

CREATE INDEX IF NOT EXISTS gallery_posts_v2_owner_idx ON gallery_posts_v2(owner_type, owner_profile_id);

CREATE TABLE IF NOT EXISTS activities_v2 (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hommie_id           UUID NOT NULL REFERENCES hommie_profiles_v2(id) ON DELETE CASCADE,
    legacy_activity_id  UUID UNIQUE,
    title               TEXT NOT NULL,
    activity_type       TEXT NOT NULL DEFAULT 'custom',
    description         TEXT,
    city                TEXT,
    price               NUMERIC DEFAULT 0,
    duration_minutes    INTEGER DEFAULT 60,
    available_time      TEXT,
    image_url           TEXT,
    capacity            INTEGER DEFAULT 1,
    status              TEXT NOT NULL DEFAULT 'draft',
    starts_at           TIMESTAMPTZ,
    ends_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activities_v2_hommie_id_idx ON activities_v2(hommie_id);

CREATE TABLE IF NOT EXISTS host_applications_v2 (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID REFERENCES users(id),
    application_type    TEXT NOT NULL DEFAULT 'host',
    status              TEXT NOT NULL DEFAULT 'draft',
    current_step        INTEGER DEFAULT 1,
    payload             JSONB NOT NULL DEFAULT '{}',
    review_notes        TEXT,
    submitted_at        TIMESTAMPTZ,
    reviewed_at         TIMESTAMPTZ,
    approved_host_id    UUID REFERENCES hosts(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hommie_applications_v2 (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID REFERENCES users(id),
    application_type    TEXT NOT NULL DEFAULT 'hommie',
    status              TEXT NOT NULL DEFAULT 'draft',
    current_step        INTEGER DEFAULT 1,
    payload             JSONB NOT NULL DEFAULT '{}',
    review_notes        TEXT,
    submitted_at        TIMESTAMPTZ,
    reviewed_at         TIMESTAMPTZ,
    approved_hommie_id  UUID REFERENCES hommie_profiles_v2(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS availability_rules_v2 (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_type       TEXT NOT NULL,
    owner_id         UUID NOT NULL,
    rule_type        TEXT NOT NULL DEFAULT 'weekly',
    weekday          INTEGER,
    start_time       TEXT,
    end_time         TEXT,
    slot_key         TEXT,
    is_available     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS availability_rules_v2_owner_idx ON availability_rules_v2(owner_type, owner_id);

CREATE TABLE IF NOT EXISTS availability_exceptions_v2 (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_type       TEXT NOT NULL,
    owner_id         UUID NOT NULL,
    exception_date   DATE NOT NULL,
    slot_key         TEXT,
    is_available     BOOLEAN NOT NULL DEFAULT FALSE,
    note             TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS availability_exceptions_v2_owner_idx ON availability_exceptions_v2(owner_type, owner_id, exception_date);

CREATE TABLE IF NOT EXISTS bookings_v2 (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES users(id),
    legacy_booking_id       UUID UNIQUE,
    booking_type            TEXT NOT NULL,
    recipient_type          TEXT NOT NULL,
    recipient_id            UUID NOT NULL,
    product_type            TEXT NOT NULL,
    product_id              UUID NOT NULL,
    host_id                 UUID REFERENCES hosts(id),
    hommie_id               UUID REFERENCES hommie_profiles_v2(id),
    activity_id             UUID REFERENCES activities_v2(id),
    status                  TEXT NOT NULL DEFAULT 'pending',
    start_date              DATE,
    end_date                DATE,
    quarter_type            TEXT,
    quarter_time            TEXT,
    guests_count            INTEGER NOT NULL DEFAULT 1,
    extra_guests            JSONB,
    notes                   TEXT,
    pricing_snapshot        JSONB NOT NULL DEFAULT '{}',
    total_price             INTEGER DEFAULT 0,
    partner_payout_amount   INTEGER DEFAULT 0,
    payment_status          TEXT NOT NULL DEFAULT 'pending',
    payment_id              UUID,
    conversation_id         UUID,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT bookings_v2_type_check CHECK (booking_type IN ('host_stay', 'hommie_session')),
    CONSTRAINT bookings_v2_recipient_type_check CHECK (recipient_type IN ('host', 'hommie')),
    CONSTRAINT bookings_v2_product_type_check CHECK (product_type IN ('host_listing', 'hommie_listing', 'activity'))
);

CREATE INDEX IF NOT EXISTS bookings_v2_user_id_idx ON bookings_v2(user_id);
CREATE INDEX IF NOT EXISTS bookings_v2_host_id_idx ON bookings_v2(host_id);
CREATE INDEX IF NOT EXISTS bookings_v2_hommie_id_idx ON bookings_v2(hommie_id);
CREATE INDEX IF NOT EXISTS bookings_v2_status_idx ON bookings_v2(status);

CREATE TABLE IF NOT EXISTS booking_status_history_v2 (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id          UUID NOT NULL REFERENCES bookings_v2(id) ON DELETE CASCADE,
    old_status          TEXT,
    new_status          TEXT NOT NULL,
    changed_by_user_id  UUID REFERENCES users(id),
    reason              TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS booking_status_history_v2_booking_idx ON booking_status_history_v2(booking_id);

CREATE TABLE IF NOT EXISTS payments_v2 (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id              UUID NOT NULL REFERENCES bookings_v2(id) ON DELETE CASCADE,
    gateway                 TEXT NOT NULL,
    gateway_order_id        TEXT,
    gateway_payment_id      TEXT,
    amount_total            INTEGER NOT NULL DEFAULT 0,
    platform_fee            INTEGER NOT NULL DEFAULT 0,
    tax_amount              INTEGER NOT NULL DEFAULT 0,
    partner_payout_amount   INTEGER NOT NULL DEFAULT 0,
    currency                TEXT NOT NULL DEFAULT 'INR',
    status                  TEXT NOT NULL DEFAULT 'created',
    paid_at                 TIMESTAMPTZ,
    raw_response            JSONB NOT NULL DEFAULT '{}',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payments_v2_booking_id_idx ON payments_v2(booking_id);
CREATE INDEX IF NOT EXISTS payments_v2_status_idx ON payments_v2(status);

CREATE TABLE IF NOT EXISTS coupons_v2 (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                TEXT NOT NULL UNIQUE,
    discount_type       TEXT NOT NULL,
    discount_value      NUMERIC NOT NULL,
    max_discount_amount INTEGER,
    min_booking_amount  INTEGER DEFAULT 0,
    applies_to_type     TEXT DEFAULT 'all',
    starts_at           TIMESTAMPTZ,
    ends_at             TIMESTAMPTZ,
    usage_limit         INTEGER,
    per_user_limit      INTEGER DEFAULT 1,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coupon_redemptions_v2 (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id           UUID NOT NULL REFERENCES coupons_v2(id) ON DELETE CASCADE,
    booking_id          UUID REFERENCES bookings_v2(id),
    user_id             UUID NOT NULL REFERENCES users(id),
    discount_amount     INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payouts_v2 (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id          UUID NOT NULL REFERENCES bookings_v2(id) ON DELETE CASCADE,
    partner_type        TEXT NOT NULL,
    partner_user_id     UUID NOT NULL REFERENCES users(id),
    partner_profile_id  UUID NOT NULL,
    amount              INTEGER NOT NULL DEFAULT 0,
    method              TEXT DEFAULT 'upi',
    status              TEXT NOT NULL DEFAULT 'pending',
    processed_at        TIMESTAMPTZ,
    reference_id        TEXT,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payouts_v2_booking_id_idx ON payouts_v2(booking_id);
CREATE INDEX IF NOT EXISTS payouts_v2_partner_user_id_idx ON payouts_v2(partner_user_id);

CREATE TABLE IF NOT EXISTS reviews_v2 (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id          UUID NOT NULL REFERENCES bookings_v2(id) ON DELETE CASCADE,
    guest_user_id       UUID NOT NULL REFERENCES users(id),
    target_type         TEXT NOT NULL,
    target_profile_id   UUID NOT NULL,
    rating              INTEGER NOT NULL,
    title               TEXT,
    body                TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reviews_v2_booking_id_idx ON reviews_v2(booking_id);
CREATE INDEX IF NOT EXISTS reviews_v2_target_idx ON reviews_v2(target_type, target_profile_id);

CREATE TABLE IF NOT EXISTS recent_views_v2 (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_type         TEXT NOT NULL,
    entity_id           UUID NOT NULL,
    viewed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT recent_views_v2_entity_type_check CHECK (entity_type IN ('host', 'hommie', 'activity', 'story', 'ad')),
    UNIQUE(user_id, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS stories_v2 (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_user_id      UUID REFERENCES users(id),
    author_name         TEXT,
    city                TEXT,
    state               TEXT,
    lat                 NUMERIC,
    lng                 NUMERIC,
    title               TEXT,
    body                TEXT,
    cover_image_url     TEXT,
    is_published        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ads_v2 (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label               TEXT,
    title               TEXT NOT NULL,
    description         TEXT,
    image_url           TEXT,
    city                TEXT,
    state               TEXT,
    lat                 NUMERIC,
    lng                 NUMERIC,
    radius_km           INTEGER,
    cta_text            TEXT,
    cta_url             TEXT,
    priority            INTEGER NOT NULL DEFAULT 0,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    starts_at           TIMESTAMPTZ,
    ends_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

NOTIFY pgrst, 'reload schema';
