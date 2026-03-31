--
-- PostgreSQL database dump
--

\restrict tW4d4W0WVJD7EJLSauuWmz6CWIEAenjxYXeazHEjoaSOUhyRdYCkqewB3KIqf5i

-- Dumped from database version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: topology; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA topology;


--
-- Name: SCHEMA topology; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA topology IS 'PostGIS Topology schema';


--
-- Name: postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;


--
-- Name: EXTENSION postgis; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION postgis IS 'PostGIS geometry and geography spatial types and functions';


--
-- Name: postgis_topology; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis_topology WITH SCHEMA topology;


--
-- Name: EXTENSION postgis_topology; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION postgis_topology IS 'PostGIS topology spatial types and functions';


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: approved_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approved_users (
    id bigint NOT NULL,
    email character varying(320) NOT NULL,
    normalized_email character varying(320) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    password_hash character varying(255),
    is_super_admin boolean DEFAULT false NOT NULL
);


--
-- Name: approved_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.approved_users ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.approved_users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: auth_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_sessions (
    id bigint NOT NULL,
    session_token_hash character(64) NOT NULL,
    email character varying(320) NOT NULL,
    normalized_email character varying(320) NOT NULL,
    session_type character varying(20) NOT NULL,
    approved_user_id bigint,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_ip character varying(64),
    created_user_agent text,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: auth_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.auth_sessions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.auth_sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: email_verification_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_verification_tokens (
    id bigint NOT NULL,
    email character varying(320) NOT NULL,
    normalized_email character varying(320) NOT NULL,
    selector character(24) NOT NULL,
    token_hash character(64) NOT NULL,
    purpose character varying(20) DEFAULT 'login'::character varying NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    requested_ip character varying(64),
    requested_user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_verification_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.email_verification_tokens ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.email_verification_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: photo_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.photo_assets (
    id bigint NOT NULL,
    photo_id bigint NOT NULL,
    kind character varying(20) NOT NULL,
    bucket character varying(100) NOT NULL,
    object_key character varying(500) NOT NULL,
    mime_type character varying(100) NOT NULL,
    size_bytes bigint NOT NULL,
    width integer,
    height integer,
    etag character varying(200),
    is_original boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_photo_assets_kind CHECK (((kind)::text = ANY ((ARRAY['original'::character varying, 'display'::character varying, 'thumb'::character varying, 'derived'::character varying])::text[])))
);


--
-- Name: photo_assets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.photo_assets ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.photo_assets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: photo_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.photo_locations (
    photo_id bigint NOT NULL,
    point public.geography(Point,4326),
    latitude double precision,
    longitude double precision,
    altitude double precision,
    accuracy_meters double precision,
    place_id character varying(255),
    country_code character varying(8),
    admin1 character varying(120),
    admin2 character varying(120),
    locality character varying(120),
    sublocality character varying(120),
    route character varying(200),
    formatted_address text,
    geocode_provider character varying(50),
    geocode_version character varying(50),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_photo_locations_latitude CHECK (((latitude IS NULL) OR ((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision)))),
    CONSTRAINT chk_photo_locations_longitude CHECK (((longitude IS NULL) OR ((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision))))
);


--
-- Name: photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.photos (
    id bigint NOT NULL,
    user_id bigint,
    album_id bigint,
    title character varying(200),
    description text,
    captured_at timestamp with time zone,
    taken_at_local timestamp without time zone,
    timezone character varying(64),
    camera_make character varying(120),
    camera_model character varying(120),
    lens_model character varying(120),
    width integer,
    height integer,
    orientation smallint,
    mime_type character varying(100),
    checksum_sha256 character(64) NOT NULL,
    visibility character varying(20) DEFAULT 'private'::character varying NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    exif jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: photos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.photos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.photos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: approved_users approved_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approved_users
    ADD CONSTRAINT approved_users_pkey PRIMARY KEY (id);


--
-- Name: auth_sessions auth_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_pkey PRIMARY KEY (id);


--
-- Name: email_verification_tokens email_verification_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_pkey PRIMARY KEY (id);


--
-- Name: photo_assets photo_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.photo_assets
    ADD CONSTRAINT photo_assets_pkey PRIMARY KEY (id);


--
-- Name: photo_locations photo_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.photo_locations
    ADD CONSTRAINT photo_locations_pkey PRIMARY KEY (photo_id);


--
-- Name: photos photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.photos
    ADD CONSTRAINT photos_pkey PRIMARY KEY (id);


--
-- Name: approved_users uq_approved_users_normalized_email; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approved_users
    ADD CONSTRAINT uq_approved_users_normalized_email UNIQUE (normalized_email);


--
-- Name: auth_sessions uq_auth_sessions_session_token_hash; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT uq_auth_sessions_session_token_hash UNIQUE (session_token_hash);


--
-- Name: email_verification_tokens uq_email_verification_tokens_selector; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT uq_email_verification_tokens_selector UNIQUE (selector);


--
-- Name: idx_auth_sessions_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_sessions_expires_at ON public.auth_sessions USING btree (expires_at);


--
-- Name: idx_auth_sessions_normalized_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_sessions_normalized_email ON public.auth_sessions USING btree (normalized_email);


--
-- Name: idx_auth_sessions_revoked_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_sessions_revoked_at ON public.auth_sessions USING btree (revoked_at);


--
-- Name: idx_auth_sessions_session_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_sessions_session_type ON public.auth_sessions USING btree (session_type);


--
-- Name: idx_email_verification_tokens_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_verification_tokens_expires_at ON public.email_verification_tokens USING btree (expires_at);


--
-- Name: idx_email_verification_tokens_normalized_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_verification_tokens_normalized_email ON public.email_verification_tokens USING btree (normalized_email);


--
-- Name: idx_email_verification_tokens_used_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_verification_tokens_used_at ON public.email_verification_tokens USING btree (used_at);


--
-- Name: idx_photo_assets_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_photo_assets_kind ON public.photo_assets USING btree (kind);


--
-- Name: idx_photo_assets_photo_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_photo_assets_photo_id ON public.photo_assets USING btree (photo_id);


--
-- Name: idx_photo_locations_country_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_photo_locations_country_code ON public.photo_locations USING btree (country_code);


--
-- Name: idx_photo_locations_locality; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_photo_locations_locality ON public.photo_locations USING btree (locality);


--
-- Name: idx_photo_locations_place_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_photo_locations_place_id ON public.photo_locations USING btree (place_id);


--
-- Name: idx_photo_locations_point_gist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_photo_locations_point_gist ON public.photo_locations USING gist (point);


--
-- Name: idx_photos_album_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_photos_album_id ON public.photos USING btree (album_id);


--
-- Name: idx_photos_captured_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_photos_captured_at ON public.photos USING btree (captured_at);


--
-- Name: idx_photos_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_photos_status ON public.photos USING btree (status);


--
-- Name: idx_photos_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_photos_user_id ON public.photos USING btree (user_id);


--
-- Name: idx_photos_visibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_photos_visibility ON public.photos USING btree (visibility);


--
-- Name: uq_photo_assets_bucket_object_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_photo_assets_bucket_object_key ON public.photo_assets USING btree (bucket, object_key);


--
-- Name: uq_photo_assets_photo_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_photo_assets_photo_kind ON public.photo_assets USING btree (photo_id, kind);


--
-- Name: uq_photos_checksum_sha256; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_photos_checksum_sha256 ON public.photos USING btree (checksum_sha256);


--
-- Name: photo_locations trg_photo_locations_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_photo_locations_set_updated_at BEFORE UPDATE ON public.photo_locations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: photos trg_photos_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_photos_set_updated_at BEFORE UPDATE ON public.photos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: auth_sessions auth_sessions_approved_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_approved_user_id_fkey FOREIGN KEY (approved_user_id) REFERENCES public.approved_users(id) ON DELETE SET NULL;


--
-- Name: photo_assets photo_assets_photo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.photo_assets
    ADD CONSTRAINT photo_assets_photo_id_fkey FOREIGN KEY (photo_id) REFERENCES public.photos(id) ON DELETE CASCADE;


--
-- Name: photo_locations photo_locations_photo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.photo_locations
    ADD CONSTRAINT photo_locations_photo_id_fkey FOREIGN KEY (photo_id) REFERENCES public.photos(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict tW4d4W0WVJD7EJLSauuWmz6CWIEAenjxYXeazHEjoaSOUhyRdYCkqewB3KIqf5i

