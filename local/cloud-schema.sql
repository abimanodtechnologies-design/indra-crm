--
-- PostgreSQL database dump
--

\restrict 4wOgJbfbVU1NzbVcZDwPdJWkdf4znhiVyt5w1qYNgiLF2IJu9cXHy1OQFQh1XJl

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: crm_set_active_industry(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_set_active_industry() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.crm_industry IS NULL OR NEW.crm_industry='' THEN
        SELECT crm_industry INTO NEW.crm_industry FROM crm_settings WHERE id=1;
      END IF;
      RETURN NEW;
    END;
  $$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
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
-- Name: crm_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'Email'::text NOT NULL,
    status text DEFAULT 'Draft'::text NOT NULL,
    created_by text,
    recipients integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    subject text,
    body text,
    cc text,
    crm_industry text DEFAULT 'general'::text NOT NULL
);

ALTER TABLE ONLY public.crm_campaigns FORCE ROW LEVEL SECURITY;


--
-- Name: crm_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    first_name text,
    last_name text,
    email text NOT NULL,
    mobile text,
    dept text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    department text,
    designation text DEFAULT 'User'::text,
    linked_lead text,
    phone text,
    alt_phone text,
    life_stage text,
    sales_commission numeric,
    crm_industry text DEFAULT 'general'::text NOT NULL
);

ALTER TABLE ONLY public.crm_contacts FORCE ROW LEVEL SECURITY;


--
-- Name: crm_customer_success; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_customer_success (
    id integer NOT NULL,
    lead_id text,
    lead_name text NOT NULL,
    customer_name text NOT NULL,
    company text,
    email text,
    phone text,
    assigned text,
    current_stage text DEFAULT 'Order Confirmed'::text NOT NULL,
    status text DEFAULT 'Active'::text NOT NULL,
    started_at timestamp without time zone DEFAULT now(),
    due_date date,
    completed_at timestamp without time zone,
    notes text,
    stage_history jsonb DEFAULT '[]'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    crm_industry text DEFAULT 'general'::text NOT NULL
);

ALTER TABLE ONLY public.crm_customer_success FORCE ROW LEVEL SECURITY;


--
-- Name: crm_customer_success_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_customer_success_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_customer_success_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_customer_success_id_seq OWNED BY public.crm_customer_success.id;


--
-- Name: crm_daily_digest_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_daily_digest_log (
    id integer NOT NULL,
    digest_date date NOT NULL,
    recipient_email text NOT NULL,
    digest_type text NOT NULL,
    status text DEFAULT 'processing'::text NOT NULL,
    sent_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: crm_daily_digest_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_daily_digest_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_daily_digest_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_daily_digest_log_id_seq OWNED BY public.crm_daily_digest_log.id;


--
-- Name: crm_followups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_followups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_name text,
    title text NOT NULL,
    status text DEFAULT 'Scheduled'::text NOT NULL,
    type text DEFAULT 'Call'::text NOT NULL,
    category text DEFAULT 'call'::text,
    assigned text,
    start_time timestamp with time zone,
    end_time timestamp with time zone,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    assigned_user_id text,
    crm_industry text DEFAULT 'general'::text NOT NULL
);

ALTER TABLE ONLY public.crm_followups FORCE ROW LEVEL SECURITY;


--
-- Name: crm_installed_machines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_installed_machines (
    id integer NOT NULL,
    lead_id text,
    customer_name text NOT NULL,
    machine_model text NOT NULL,
    serial_number text,
    installation_date date,
    warranty_start date,
    warranty_end date,
    next_maintenance date,
    spare_requirement text,
    amc_status text DEFAULT 'Not Applicable'::text,
    amc_start date,
    amc_end date,
    location text,
    assigned_user_id text,
    assigned text,
    status text DEFAULT 'Active'::text,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    crm_industry text DEFAULT 'general'::text NOT NULL
);

ALTER TABLE ONLY public.crm_installed_machines FORCE ROW LEVEL SECURITY;


--
-- Name: crm_installed_machines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_installed_machines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_installed_machines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_installed_machines_id_seq OWNED BY public.crm_installed_machines.id;


--
-- Name: crm_lead_contact_persons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_lead_contact_persons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid,
    prefix text,
    first_name text,
    last_name text,
    email text,
    mobile text,
    alt_phone text,
    family_phone text,
    department text,
    designation text,
    commission numeric,
    allow_login boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: crm_lead_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_lead_locations (
    id integer NOT NULL,
    lead_id text NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    accuracy double precision,
    capture_source text DEFAULT 'lead_form'::text NOT NULL,
    captured_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: crm_lead_locations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_lead_locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_lead_locations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_lead_locations_id_seq OWNED BY public.crm_lead_locations.id;


--
-- Name: crm_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    mobile text,
    email text,
    company text,
    source text,
    stage text DEFAULT 'New'::text NOT NULL,
    assigned text,
    dob date,
    notes text,
    value numeric(12,2) DEFAULT 0,
    converted boolean DEFAULT false,
    converted_date date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    contact text,
    location text,
    industry text,
    status text DEFAULT 'Active'::text,
    contact_type text DEFAULT 'Individual'::text,
    tax_number text,
    address1 text,
    address2 text,
    city text,
    state text,
    country text,
    zip_code text,
    landmark text,
    street_name text,
    building_number text,
    additional_number text,
    custom_fields jsonb DEFAULT '{}'::jsonb,
    entity_type text,
    contact_persons jsonb DEFAULT '[]'::jsonb,
    lead_details jsonb DEFAULT '{}'::jsonb,
    product_category text,
    machine_type text,
    application text,
    requirement_quantity integer,
    installation_location text,
    requirement_details text,
    budget numeric DEFAULT 0,
    expected_purchase_date date,
    quotation_value numeric DEFAULT 0,
    competitor_details text,
    next_followup_date timestamp without time zone,
    next_followup_activity text,
    gps_latitude double precision,
    gps_longitude double precision,
    gps_accuracy double precision,
    gps_captured_at timestamp without time zone,
    crm_industry text DEFAULT 'general'::text NOT NULL
);

ALTER TABLE ONLY public.crm_leads FORCE ROW LEVEL SECURITY;


--
-- Name: crm_machine_automation_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_machine_automation_log (
    id integer NOT NULL,
    event_key text NOT NULL,
    recipient_email text NOT NULL,
    status text DEFAULT 'processing'::text NOT NULL,
    sent_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: crm_machine_automation_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_machine_automation_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_machine_automation_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_machine_automation_log_id_seq OWNED BY public.crm_machine_automation_log.id;


--
-- Name: crm_machine_consumables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_machine_consumables (
    id integer NOT NULL,
    machine_id integer,
    lead_id text,
    customer_name text NOT NULL,
    item_name text NOT NULL,
    category text DEFAULT 'Consumable'::text,
    quantity numeric DEFAULT 0,
    unit text DEFAULT 'Nos'::text,
    reorder_level numeric DEFAULT 0,
    last_supplied_date date,
    next_requirement_date date,
    unit_price numeric DEFAULT 0,
    status text DEFAULT 'Active'::text,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    sku text,
    brand text,
    specification text,
    supply_type text DEFAULT 'Sale'::text,
    order_invoice_number text,
    purchase_cost numeric DEFAULT 0,
    tax_percent numeric DEFAULT 0,
    last_supplied_quantity numeric DEFAULT 0,
    consumption_frequency text DEFAULT 'Monthly'::text,
    frequency_days integer DEFAULT 30,
    assigned_user_id text,
    assigned text,
    opportunity_status text DEFAULT 'Reminder Due'::text,
    customer_contact_name text,
    customer_contact_phone text,
    crm_industry text DEFAULT 'general'::text NOT NULL
);

ALTER TABLE ONLY public.crm_machine_consumables FORCE ROW LEVEL SECURITY;


--
-- Name: crm_machine_consumables_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_machine_consumables_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_machine_consumables_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_machine_consumables_id_seq OWNED BY public.crm_machine_consumables.id;


--
-- Name: crm_machine_replacement_opportunities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_machine_replacement_opportunities (
    id integer NOT NULL,
    machine_id integer,
    lead_id text,
    customer_name text NOT NULL,
    current_model text,
    replacement_reason text,
    proposed_model text,
    expected_purchase_date date,
    estimated_value numeric DEFAULT 0,
    stage text DEFAULT 'New'::text,
    assigned_user_id text,
    assigned text,
    status text DEFAULT 'Open'::text,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    crm_industry text DEFAULT 'general'::text NOT NULL
);

ALTER TABLE ONLY public.crm_machine_replacement_opportunities FORCE ROW LEVEL SECURITY;


--
-- Name: crm_machine_replacement_opportunities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_machine_replacement_opportunities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_machine_replacement_opportunities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_machine_replacement_opportunities_id_seq OWNED BY public.crm_machine_replacement_opportunities.id;


--
-- Name: crm_machine_service_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_machine_service_attachments (
    id integer NOT NULL,
    service_id integer NOT NULL,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    file_size integer NOT NULL,
    file_data bytea NOT NULL,
    uploaded_by text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: crm_machine_service_attachments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_machine_service_attachments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_machine_service_attachments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_machine_service_attachments_id_seq OWNED BY public.crm_machine_service_attachments.id;


--
-- Name: crm_machine_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_machine_services (
    id integer NOT NULL,
    machine_id integer NOT NULL,
    service_date date NOT NULL,
    service_type text DEFAULT 'Preventive Maintenance'::text,
    issue_reported text,
    work_performed text,
    spare_used text,
    technician text,
    next_service_date date,
    status text DEFAULT 'Completed'::text,
    cost numeric DEFAULT 0,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    service_category text DEFAULT 'Preventive Maintenance'::text,
    assigned_technician_id text,
    customer_contact_name text,
    customer_contact_phone text,
    coverage_status text DEFAULT 'Chargeable'::text,
    resolution_status text DEFAULT 'Resolved'::text,
    labor_cost numeric DEFAULT 0,
    spare_cost numeric DEFAULT 0,
    travel_cost numeric DEFAULT 0,
    downtime_start timestamp without time zone,
    downtime_end timestamp without time zone,
    downtime_minutes integer DEFAULT 0,
    customer_confirmation_name text,
    customer_feedback text,
    customer_rating integer
);


--
-- Name: crm_machine_services_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_machine_services_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_machine_services_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_machine_services_id_seq OWNED BY public.crm_machine_services.id;


--
-- Name: crm_payment_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_payment_reminders (
    id integer NOT NULL,
    proposal_id text,
    lead_id text,
    lead_name text NOT NULL,
    customer_name text NOT NULL,
    company text,
    email text,
    phone text,
    assigned text,
    amount numeric DEFAULT 0,
    current_stage text DEFAULT 'Advance Payment Pending'::text NOT NULL,
    status text DEFAULT 'Pending'::text NOT NULL,
    due_date date,
    paid_at timestamp without time zone,
    notes text,
    stage_history jsonb DEFAULT '[]'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    crm_industry text DEFAULT 'general'::text NOT NULL
);

ALTER TABLE ONLY public.crm_payment_reminders FORCE ROW LEVEL SECURITY;


--
-- Name: crm_payment_reminders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_payment_reminders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_payment_reminders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_payment_reminders_id_seq OWNED BY public.crm_payment_reminders.id;


--
-- Name: crm_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_name text,
    subject text NOT NULL,
    sent_by text,
    value numeric(12,2) DEFAULT 0,
    status text DEFAULT 'Draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    due_date date,
    cc text,
    bcc text,
    body text,
    public_token text,
    sent_at timestamp without time zone,
    first_viewed_at timestamp without time zone,
    last_viewed_at timestamp without time zone,
    view_count integer DEFAULT 0 NOT NULL,
    followup_1_sent_at timestamp without time zone,
    call_task_created_at timestamp without time zone,
    final_reminder_sent_at timestamp without time zone,
    responded_at timestamp without time zone,
    crm_industry text DEFAULT 'general'::text NOT NULL
);

ALTER TABLE ONLY public.crm_proposals FORCE ROW LEVEL SECURITY;


--
-- Name: crm_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_settings (
    id integer DEFAULT 1 NOT NULL,
    company_name text DEFAULT 'Manod Technologies'::text NOT NULL,
    currency text DEFAULT 'INR'::text NOT NULL,
    default_assigned text,
    default_stage text DEFAULT 'New'::text NOT NULL,
    default_source text DEFAULT 'Website'::text NOT NULL,
    updated_by text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    crm_industry text DEFAULT 'general'::text NOT NULL,
    CONSTRAINT crm_settings_id_check CHECK ((id = 1))
);


--
-- Name: crm_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    subject text NOT NULL,
    description text,
    status text DEFAULT 'Active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: export_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.export_documents (
    id integer NOT NULL,
    document_no text NOT NULL,
    order_id integer,
    shipment_id integer,
    document_type text NOT NULL,
    buyer_name text,
    document_date date,
    status text DEFAULT 'Draft'::text,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: export_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.export_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: export_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.export_documents_id_seq OWNED BY public.export_documents.id;


--
-- Name: export_inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.export_inventory (
    id integer NOT NULL,
    product_name text NOT NULL,
    sku text,
    warehouse text,
    batch_no text,
    quantity numeric DEFAULT 0,
    reserved_quantity numeric DEFAULT 0,
    reorder_level numeric DEFAULT 0,
    unit text DEFAULT 'Unit'::text,
    status text DEFAULT 'Available'::text,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: export_inventory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.export_inventory_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: export_inventory_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.export_inventory_id_seq OWNED BY public.export_inventory.id;


--
-- Name: export_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.export_orders (
    id integer NOT NULL,
    order_no text NOT NULL,
    quotation_id integer,
    buyer_name text NOT NULL,
    buyer_email text,
    product_summary text,
    order_value numeric DEFAULT 0,
    currency text DEFAULT 'USD'::text,
    incoterm text DEFAULT 'FOB'::text,
    stage text DEFAULT 'Order Confirmed'::text,
    production_status text DEFAULT 'Not Started'::text,
    expected_shipment date,
    container_no text,
    destination_country text,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: export_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.export_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: export_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.export_orders_id_seq OWNED BY public.export_orders.id;


--
-- Name: export_packing_dispatch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.export_packing_dispatch (
    id integer NOT NULL,
    dispatch_no text NOT NULL,
    order_id integer,
    buyer_name text,
    packing_status text DEFAULT 'Not Started'::text,
    package_count integer DEFAULT 0,
    gross_weight numeric DEFAULT 0,
    dispatch_date date,
    status text DEFAULT 'Planned'::text,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: export_packing_dispatch_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.export_packing_dispatch_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: export_packing_dispatch_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.export_packing_dispatch_id_seq OWNED BY public.export_packing_dispatch.id;


--
-- Name: export_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.export_payments (
    id integer NOT NULL,
    payment_ref text NOT NULL,
    order_id integer,
    buyer_name text NOT NULL,
    payment_type text DEFAULT 'Advance'::text,
    payment_mode text DEFAULT 'TT'::text,
    currency text DEFAULT 'USD'::text,
    invoice_amount numeric DEFAULT 0,
    received_amount numeric DEFAULT 0,
    due_date date,
    received_date date,
    status text DEFAULT 'Pending'::text,
    lc_number text,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: export_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.export_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: export_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.export_payments_id_seq OWNED BY public.export_payments.id;


--
-- Name: export_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.export_products (
    id integer NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    hs_code text,
    specification text,
    certification text,
    currency text DEFAULT 'USD'::text,
    unit_price numeric DEFAULT 0,
    unit text DEFAULT 'Unit'::text,
    status text DEFAULT 'Active'::text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: export_products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.export_products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: export_products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.export_products_id_seq OWNED BY public.export_products.id;


--
-- Name: export_purchase_enquiries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.export_purchase_enquiries (
    id integer NOT NULL,
    enquiry_no text NOT NULL,
    vendor_id integer,
    vendor_name text NOT NULL,
    product_name text NOT NULL,
    quantity numeric DEFAULT 0,
    unit text,
    required_by date,
    status text DEFAULT 'Open'::text,
    quoted_price numeric DEFAULT 0,
    currency text DEFAULT 'USD'::text,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: export_purchase_enquiries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.export_purchase_enquiries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: export_purchase_enquiries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.export_purchase_enquiries_id_seq OWNED BY public.export_purchase_enquiries.id;


--
-- Name: export_quotations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.export_quotations (
    id integer NOT NULL,
    quotation_no text NOT NULL,
    rfq_id integer,
    buyer_name text NOT NULL,
    buyer_email text,
    currency text DEFAULT 'USD'::text,
    amount numeric DEFAULT 0,
    incoterm text DEFAULT 'FOB'::text,
    validity_date date,
    status text DEFAULT 'Draft'::text,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: export_quotations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.export_quotations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: export_quotations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.export_quotations_id_seq OWNED BY public.export_quotations.id;


--
-- Name: export_rfqs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.export_rfqs (
    id integer NOT NULL,
    reference_no text NOT NULL,
    buyer_name text NOT NULL,
    buyer_email text,
    product_id integer,
    quantity numeric DEFAULT 0,
    unit text,
    incoterm text DEFAULT 'FOB'::text,
    destination_country text,
    required_by date,
    status text DEFAULT 'New'::text,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: export_rfqs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.export_rfqs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: export_rfqs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.export_rfqs_id_seq OWNED BY public.export_rfqs.id;


--
-- Name: export_shipments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.export_shipments (
    id integer NOT NULL,
    shipment_no text NOT NULL,
    order_id integer,
    buyer_name text NOT NULL,
    container_no text,
    vessel_name text,
    port_of_loading text,
    port_of_discharge text,
    etd date,
    eta date,
    status text DEFAULT 'Scheduled'::text,
    milestone text DEFAULT 'Booking Confirmed'::text,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: export_shipments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.export_shipments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: export_shipments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.export_shipments_id_seq OWNED BY public.export_shipments.id;


--
-- Name: export_vendors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.export_vendors (
    id integer NOT NULL,
    name text NOT NULL,
    contact_name text,
    email text,
    phone text,
    country text DEFAULT 'India'::text,
    categories text,
    certification text,
    status text DEFAULT 'Active'::text,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: export_vendors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.export_vendors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: export_vendors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.export_vendors_id_seq OWNED BY public.export_vendors.id;


--
-- Name: hrms_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hrms_attendance (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    attendance_date date DEFAULT CURRENT_DATE NOT NULL,
    check_in time without time zone,
    check_out time without time zone,
    status text DEFAULT 'Present'::text NOT NULL,
    notes text
);


--
-- Name: hrms_attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hrms_attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hrms_attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hrms_attendance_id_seq OWNED BY public.hrms_attendance.id;


--
-- Name: hrms_employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hrms_employees (
    id integer NOT NULL,
    employee_code text NOT NULL,
    name text NOT NULL,
    job_title text NOT NULL,
    department text NOT NULL,
    email text NOT NULL,
    phone text,
    joined_on date DEFAULT CURRENT_DATE NOT NULL,
    status text DEFAULT 'Active'::text NOT NULL,
    monthly_salary numeric(12,2) DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: hrms_employees_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hrms_employees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hrms_employees_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hrms_employees_id_seq OWNED BY public.hrms_employees.id;


--
-- Name: hrms_leave_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hrms_leave_requests (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    leave_type text NOT NULL,
    from_date date NOT NULL,
    to_date date NOT NULL,
    days integer NOT NULL,
    reason text,
    status text DEFAULT 'Pending'::text NOT NULL,
    reviewed_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: hrms_leave_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hrms_leave_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hrms_leave_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hrms_leave_requests_id_seq OWNED BY public.hrms_leave_requests.id;


--
-- Name: hrms_payroll; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hrms_payroll (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    payroll_month date NOT NULL,
    gross_salary numeric(12,2) NOT NULL,
    deductions numeric(12,2) DEFAULT 0 NOT NULL,
    net_salary numeric(12,2) NOT NULL,
    status text DEFAULT 'Pending'::text NOT NULL,
    paid_at timestamp without time zone
);


--
-- Name: hrms_payroll_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hrms_payroll_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hrms_payroll_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hrms_payroll_id_seq OWNED BY public.hrms_payroll.id;


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id integer NOT NULL,
    group_name text NOT NULL,
    name text NOT NULL
);


--
-- Name: permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.permissions_id_seq OWNED BY public.permissions.id;


--
-- Name: real_estate_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.real_estate_bookings (
    id integer NOT NULL,
    booking_no text NOT NULL,
    lead_name text NOT NULL,
    property_id integer,
    token_amount numeric DEFAULT 0,
    booking_date date,
    status text DEFAULT 'Reserved'::text,
    agreement_status text DEFAULT 'Pending'::text,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: real_estate_bookings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.real_estate_bookings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: real_estate_bookings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.real_estate_bookings_id_seq OWNED BY public.real_estate_bookings.id;


--
-- Name: real_estate_brokers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.real_estate_brokers (
    id integer NOT NULL,
    name text NOT NULL,
    company text,
    phone text,
    email text,
    commission_percent numeric DEFAULT 0,
    status text DEFAULT 'Active'::text,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: real_estate_brokers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.real_estate_brokers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: real_estate_brokers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.real_estate_brokers_id_seq OWNED BY public.real_estate_brokers.id;


--
-- Name: real_estate_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.real_estate_payments (
    id integer NOT NULL,
    receipt_no text NOT NULL,
    booking_id integer,
    customer_name text NOT NULL,
    installment_name text,
    amount_due numeric DEFAULT 0,
    amount_received numeric DEFAULT 0,
    due_date date,
    received_date date,
    status text DEFAULT 'Pending'::text,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: real_estate_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.real_estate_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: real_estate_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.real_estate_payments_id_seq OWNED BY public.real_estate_payments.id;


--
-- Name: real_estate_properties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.real_estate_properties (
    id integer NOT NULL,
    project_name text NOT NULL,
    property_name text NOT NULL,
    property_type text,
    location text,
    price numeric DEFAULT 0,
    status text DEFAULT 'Available'::text,
    bedrooms text,
    area text,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: real_estate_properties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.real_estate_properties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: real_estate_properties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.real_estate_properties_id_seq OWNED BY public.real_estate_properties.id;


--
-- Name: real_estate_site_visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.real_estate_site_visits (
    id integer NOT NULL,
    lead_name text NOT NULL,
    property_id integer,
    visit_date timestamp without time zone,
    status text DEFAULT 'Scheduled'::text,
    assigned text,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: real_estate_site_visits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.real_estate_site_visits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: real_estate_site_visits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.real_estate_site_visits_id_seq OWNED BY public.real_estate_site_visits.id;


--
-- Name: register_cash_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.register_cash_movements (
    id integer NOT NULL,
    session_id integer NOT NULL,
    type character varying(10) NOT NULL,
    amount numeric(12,2) NOT NULL,
    reason text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: register_cash_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.register_cash_movements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: register_cash_movements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.register_cash_movements_id_seq OWNED BY public.register_cash_movements.id;


--
-- Name: register_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.register_sessions (
    id integer NOT NULL,
    location character varying(255),
    cashier_id uuid NOT NULL,
    shift character varying(50) DEFAULT 'Morning'::character varying,
    opening_balance numeric(12,2) DEFAULT 0,
    cash_in numeric(12,2) DEFAULT 0,
    cash_out numeric(12,2) DEFAULT 0,
    closing_balance numeric(12,2),
    total_sales numeric(12,2) DEFAULT 0,
    status character varying(20) DEFAULT 'open'::character varying,
    opened_at timestamp without time zone DEFAULT now(),
    closed_at timestamp without time zone,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: register_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.register_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: register_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.register_sessions_id_seq OWNED BY public.register_sessions.id;


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role_id integer NOT NULL,
    permission_id integer NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id integer NOT NULL,
    role_name text NOT NULL,
    description text,
    deletable boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    full_name text,
    phone text,
    role text DEFAULT 'employee'::text,
    status text DEFAULT 'active'::text,
    department text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    basic_salary numeric(12,2) DEFAULT 0 NOT NULL,
    salary_period text DEFAULT 'Per Month'::text NOT NULL
);


--
-- Name: crm_customer_success id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_customer_success ALTER COLUMN id SET DEFAULT nextval('public.crm_customer_success_id_seq'::regclass);


--
-- Name: crm_daily_digest_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_daily_digest_log ALTER COLUMN id SET DEFAULT nextval('public.crm_daily_digest_log_id_seq'::regclass);


--
-- Name: crm_installed_machines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_installed_machines ALTER COLUMN id SET DEFAULT nextval('public.crm_installed_machines_id_seq'::regclass);


--
-- Name: crm_lead_locations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_locations ALTER COLUMN id SET DEFAULT nextval('public.crm_lead_locations_id_seq'::regclass);


--
-- Name: crm_machine_automation_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_machine_automation_log ALTER COLUMN id SET DEFAULT nextval('public.crm_machine_automation_log_id_seq'::regclass);


--
-- Name: crm_machine_consumables id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_machine_consumables ALTER COLUMN id SET DEFAULT nextval('public.crm_machine_consumables_id_seq'::regclass);


--
-- Name: crm_machine_replacement_opportunities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_machine_replacement_opportunities ALTER COLUMN id SET DEFAULT nextval('public.crm_machine_replacement_opportunities_id_seq'::regclass);


--
-- Name: crm_machine_service_attachments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_machine_service_attachments ALTER COLUMN id SET DEFAULT nextval('public.crm_machine_service_attachments_id_seq'::regclass);


--
-- Name: crm_machine_services id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_machine_services ALTER COLUMN id SET DEFAULT nextval('public.crm_machine_services_id_seq'::regclass);


--
-- Name: crm_payment_reminders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_payment_reminders ALTER COLUMN id SET DEFAULT nextval('public.crm_payment_reminders_id_seq'::regclass);


--
-- Name: export_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_documents ALTER COLUMN id SET DEFAULT nextval('public.export_documents_id_seq'::regclass);


--
-- Name: export_inventory id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_inventory ALTER COLUMN id SET DEFAULT nextval('public.export_inventory_id_seq'::regclass);


--
-- Name: export_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_orders ALTER COLUMN id SET DEFAULT nextval('public.export_orders_id_seq'::regclass);


--
-- Name: export_packing_dispatch id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_packing_dispatch ALTER COLUMN id SET DEFAULT nextval('public.export_packing_dispatch_id_seq'::regclass);


--
-- Name: export_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_payments ALTER COLUMN id SET DEFAULT nextval('public.export_payments_id_seq'::regclass);


--
-- Name: export_products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_products ALTER COLUMN id SET DEFAULT nextval('public.export_products_id_seq'::regclass);


--
-- Name: export_purchase_enquiries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_purchase_enquiries ALTER COLUMN id SET DEFAULT nextval('public.export_purchase_enquiries_id_seq'::regclass);


--
-- Name: export_quotations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_quotations ALTER COLUMN id SET DEFAULT nextval('public.export_quotations_id_seq'::regclass);


--
-- Name: export_rfqs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_rfqs ALTER COLUMN id SET DEFAULT nextval('public.export_rfqs_id_seq'::regclass);


--
-- Name: export_shipments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_shipments ALTER COLUMN id SET DEFAULT nextval('public.export_shipments_id_seq'::regclass);


--
-- Name: export_vendors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_vendors ALTER COLUMN id SET DEFAULT nextval('public.export_vendors_id_seq'::regclass);


--
-- Name: hrms_attendance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrms_attendance ALTER COLUMN id SET DEFAULT nextval('public.hrms_attendance_id_seq'::regclass);


--
-- Name: hrms_employees id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrms_employees ALTER COLUMN id SET DEFAULT nextval('public.hrms_employees_id_seq'::regclass);


--
-- Name: hrms_leave_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrms_leave_requests ALTER COLUMN id SET DEFAULT nextval('public.hrms_leave_requests_id_seq'::regclass);


--
-- Name: hrms_payroll id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrms_payroll ALTER COLUMN id SET DEFAULT nextval('public.hrms_payroll_id_seq'::regclass);


--
-- Name: permissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions ALTER COLUMN id SET DEFAULT nextval('public.permissions_id_seq'::regclass);


--
-- Name: real_estate_bookings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.real_estate_bookings ALTER COLUMN id SET DEFAULT nextval('public.real_estate_bookings_id_seq'::regclass);


--
-- Name: real_estate_brokers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.real_estate_brokers ALTER COLUMN id SET DEFAULT nextval('public.real_estate_brokers_id_seq'::regclass);


--
-- Name: real_estate_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.real_estate_payments ALTER COLUMN id SET DEFAULT nextval('public.real_estate_payments_id_seq'::regclass);


--
-- Name: real_estate_properties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.real_estate_properties ALTER COLUMN id SET DEFAULT nextval('public.real_estate_properties_id_seq'::regclass);


--
-- Name: real_estate_site_visits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.real_estate_site_visits ALTER COLUMN id SET DEFAULT nextval('public.real_estate_site_visits_id_seq'::regclass);


--
-- Name: register_cash_movements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.register_cash_movements ALTER COLUMN id SET DEFAULT nextval('public.register_cash_movements_id_seq'::regclass);


--
-- Name: register_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.register_sessions ALTER COLUMN id SET DEFAULT nextval('public.register_sessions_id_seq'::regclass);


--
-- Name: roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);


--
-- Name: crm_campaigns crm_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_campaigns
    ADD CONSTRAINT crm_campaigns_pkey PRIMARY KEY (id);


--
-- Name: crm_contacts crm_contacts_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts
    ADD CONSTRAINT crm_contacts_email_key UNIQUE (email);


--
-- Name: crm_contacts crm_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts
    ADD CONSTRAINT crm_contacts_pkey PRIMARY KEY (id);


--
-- Name: crm_customer_success crm_customer_success_lead_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_customer_success
    ADD CONSTRAINT crm_customer_success_lead_name_key UNIQUE (lead_name);


--
-- Name: crm_customer_success crm_customer_success_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_customer_success
    ADD CONSTRAINT crm_customer_success_pkey PRIMARY KEY (id);


--
-- Name: crm_daily_digest_log crm_daily_digest_log_digest_date_recipient_email_digest_typ_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_daily_digest_log
    ADD CONSTRAINT crm_daily_digest_log_digest_date_recipient_email_digest_typ_key UNIQUE (digest_date, recipient_email, digest_type);


--
-- Name: crm_daily_digest_log crm_daily_digest_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_daily_digest_log
    ADD CONSTRAINT crm_daily_digest_log_pkey PRIMARY KEY (id);


--
-- Name: crm_followups crm_followups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_followups
    ADD CONSTRAINT crm_followups_pkey PRIMARY KEY (id);


--
-- Name: crm_installed_machines crm_installed_machines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_installed_machines
    ADD CONSTRAINT crm_installed_machines_pkey PRIMARY KEY (id);


--
-- Name: crm_installed_machines crm_installed_machines_serial_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_installed_machines
    ADD CONSTRAINT crm_installed_machines_serial_number_key UNIQUE (serial_number);


--
-- Name: crm_lead_contact_persons crm_lead_contact_persons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_contact_persons
    ADD CONSTRAINT crm_lead_contact_persons_pkey PRIMARY KEY (id);


--
-- Name: crm_lead_locations crm_lead_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_locations
    ADD CONSTRAINT crm_lead_locations_pkey PRIMARY KEY (id);


--
-- Name: crm_leads crm_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads
    ADD CONSTRAINT crm_leads_pkey PRIMARY KEY (id);


--
-- Name: crm_machine_automation_log crm_machine_automation_log_event_key_recipient_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_machine_automation_log
    ADD CONSTRAINT crm_machine_automation_log_event_key_recipient_email_key UNIQUE (event_key, recipient_email);


--
-- Name: crm_machine_automation_log crm_machine_automation_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_machine_automation_log
    ADD CONSTRAINT crm_machine_automation_log_pkey PRIMARY KEY (id);


--
-- Name: crm_machine_consumables crm_machine_consumables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_machine_consumables
    ADD CONSTRAINT crm_machine_consumables_pkey PRIMARY KEY (id);


--
-- Name: crm_machine_replacement_opportunities crm_machine_replacement_opportunities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_machine_replacement_opportunities
    ADD CONSTRAINT crm_machine_replacement_opportunities_pkey PRIMARY KEY (id);


--
-- Name: crm_machine_service_attachments crm_machine_service_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_machine_service_attachments
    ADD CONSTRAINT crm_machine_service_attachments_pkey PRIMARY KEY (id);


--
-- Name: crm_machine_services crm_machine_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_machine_services
    ADD CONSTRAINT crm_machine_services_pkey PRIMARY KEY (id);


--
-- Name: crm_payment_reminders crm_payment_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_payment_reminders
    ADD CONSTRAINT crm_payment_reminders_pkey PRIMARY KEY (id);


--
-- Name: crm_payment_reminders crm_payment_reminders_proposal_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_payment_reminders
    ADD CONSTRAINT crm_payment_reminders_proposal_id_key UNIQUE (proposal_id);


--
-- Name: crm_proposals crm_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_proposals
    ADD CONSTRAINT crm_proposals_pkey PRIMARY KEY (id);


--
-- Name: crm_settings crm_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_settings
    ADD CONSTRAINT crm_settings_pkey PRIMARY KEY (id);


--
-- Name: crm_templates crm_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_templates
    ADD CONSTRAINT crm_templates_pkey PRIMARY KEY (id);


--
-- Name: export_documents export_documents_document_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_documents
    ADD CONSTRAINT export_documents_document_no_key UNIQUE (document_no);


--
-- Name: export_documents export_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_documents
    ADD CONSTRAINT export_documents_pkey PRIMARY KEY (id);


--
-- Name: export_inventory export_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_inventory
    ADD CONSTRAINT export_inventory_pkey PRIMARY KEY (id);


--
-- Name: export_orders export_orders_order_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_orders
    ADD CONSTRAINT export_orders_order_no_key UNIQUE (order_no);


--
-- Name: export_orders export_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_orders
    ADD CONSTRAINT export_orders_pkey PRIMARY KEY (id);


--
-- Name: export_packing_dispatch export_packing_dispatch_dispatch_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_packing_dispatch
    ADD CONSTRAINT export_packing_dispatch_dispatch_no_key UNIQUE (dispatch_no);


--
-- Name: export_packing_dispatch export_packing_dispatch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_packing_dispatch
    ADD CONSTRAINT export_packing_dispatch_pkey PRIMARY KEY (id);


--
-- Name: export_payments export_payments_payment_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_payments
    ADD CONSTRAINT export_payments_payment_ref_key UNIQUE (payment_ref);


--
-- Name: export_payments export_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_payments
    ADD CONSTRAINT export_payments_pkey PRIMARY KEY (id);


--
-- Name: export_products export_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_products
    ADD CONSTRAINT export_products_pkey PRIMARY KEY (id);


--
-- Name: export_purchase_enquiries export_purchase_enquiries_enquiry_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_purchase_enquiries
    ADD CONSTRAINT export_purchase_enquiries_enquiry_no_key UNIQUE (enquiry_no);


--
-- Name: export_purchase_enquiries export_purchase_enquiries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_purchase_enquiries
    ADD CONSTRAINT export_purchase_enquiries_pkey PRIMARY KEY (id);


--
-- Name: export_quotations export_quotations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_quotations
    ADD CONSTRAINT export_quotations_pkey PRIMARY KEY (id);


--
-- Name: export_quotations export_quotations_quotation_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_quotations
    ADD CONSTRAINT export_quotations_quotation_no_key UNIQUE (quotation_no);


--
-- Name: export_rfqs export_rfqs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_rfqs
    ADD CONSTRAINT export_rfqs_pkey PRIMARY KEY (id);


--
-- Name: export_rfqs export_rfqs_reference_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_rfqs
    ADD CONSTRAINT export_rfqs_reference_no_key UNIQUE (reference_no);


--
-- Name: export_shipments export_shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_shipments
    ADD CONSTRAINT export_shipments_pkey PRIMARY KEY (id);


--
-- Name: export_shipments export_shipments_shipment_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_shipments
    ADD CONSTRAINT export_shipments_shipment_no_key UNIQUE (shipment_no);


--
-- Name: export_vendors export_vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_vendors
    ADD CONSTRAINT export_vendors_pkey PRIMARY KEY (id);


--
-- Name: hrms_attendance hrms_attendance_employee_id_attendance_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrms_attendance
    ADD CONSTRAINT hrms_attendance_employee_id_attendance_date_key UNIQUE (employee_id, attendance_date);


--
-- Name: hrms_attendance hrms_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrms_attendance
    ADD CONSTRAINT hrms_attendance_pkey PRIMARY KEY (id);


--
-- Name: hrms_employees hrms_employees_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrms_employees
    ADD CONSTRAINT hrms_employees_email_key UNIQUE (email);


--
-- Name: hrms_employees hrms_employees_employee_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrms_employees
    ADD CONSTRAINT hrms_employees_employee_code_key UNIQUE (employee_code);


--
-- Name: hrms_employees hrms_employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrms_employees
    ADD CONSTRAINT hrms_employees_pkey PRIMARY KEY (id);


--
-- Name: hrms_leave_requests hrms_leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrms_leave_requests
    ADD CONSTRAINT hrms_leave_requests_pkey PRIMARY KEY (id);


--
-- Name: hrms_payroll hrms_payroll_employee_id_payroll_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrms_payroll
    ADD CONSTRAINT hrms_payroll_employee_id_payroll_month_key UNIQUE (employee_id, payroll_month);


--
-- Name: hrms_payroll hrms_payroll_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrms_payroll
    ADD CONSTRAINT hrms_payroll_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_group_name_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_group_name_name_key UNIQUE (group_name, name);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: real_estate_bookings real_estate_bookings_booking_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.real_estate_bookings
    ADD CONSTRAINT real_estate_bookings_booking_no_key UNIQUE (booking_no);


--
-- Name: real_estate_bookings real_estate_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.real_estate_bookings
    ADD CONSTRAINT real_estate_bookings_pkey PRIMARY KEY (id);


--
-- Name: real_estate_brokers real_estate_brokers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.real_estate_brokers
    ADD CONSTRAINT real_estate_brokers_pkey PRIMARY KEY (id);


--
-- Name: real_estate_payments real_estate_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.real_estate_payments
    ADD CONSTRAINT real_estate_payments_pkey PRIMARY KEY (id);


--
-- Name: real_estate_payments real_estate_payments_receipt_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.real_estate_payments
    ADD CONSTRAINT real_estate_payments_receipt_no_key UNIQUE (receipt_no);


--
-- Name: real_estate_properties real_estate_properties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.real_estate_properties
    ADD CONSTRAINT real_estate_properties_pkey PRIMARY KEY (id);


--
-- Name: real_estate_site_visits real_estate_site_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.real_estate_site_visits
    ADD CONSTRAINT real_estate_site_visits_pkey PRIMARY KEY (id);


--
-- Name: register_cash_movements register_cash_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.register_cash_movements
    ADD CONSTRAINT register_cash_movements_pkey PRIMARY KEY (id);


--
-- Name: register_sessions register_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.register_sessions
    ADD CONSTRAINT register_sessions_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: roles roles_role_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_role_name_key UNIQUE (role_name);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: crm_campaigns_crm_industry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_campaigns_crm_industry_idx ON public.crm_campaigns USING btree (crm_industry);


--
-- Name: crm_contacts_crm_industry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_contacts_crm_industry_idx ON public.crm_contacts USING btree (crm_industry);


--
-- Name: crm_customer_success_crm_industry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_customer_success_crm_industry_idx ON public.crm_customer_success USING btree (crm_industry);


--
-- Name: crm_followups_crm_industry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_followups_crm_industry_idx ON public.crm_followups USING btree (crm_industry);


--
-- Name: crm_installed_machines_crm_industry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_installed_machines_crm_industry_idx ON public.crm_installed_machines USING btree (crm_industry);


--
-- Name: crm_lead_locations_lead_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_lead_locations_lead_id_idx ON public.crm_lead_locations USING btree (lead_id);


--
-- Name: crm_leads_crm_industry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_leads_crm_industry_idx ON public.crm_leads USING btree (crm_industry);


--
-- Name: crm_machine_consumables_crm_industry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_machine_consumables_crm_industry_idx ON public.crm_machine_consumables USING btree (crm_industry);


--
-- Name: crm_machine_replacement_opportunities_crm_industry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_machine_replacement_opportunities_crm_industry_idx ON public.crm_machine_replacement_opportunities USING btree (crm_industry);


--
-- Name: crm_payment_reminders_crm_industry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_payment_reminders_crm_industry_idx ON public.crm_payment_reminders USING btree (crm_industry);


--
-- Name: crm_proposals_crm_industry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_proposals_crm_industry_idx ON public.crm_proposals USING btree (crm_industry);


--
-- Name: crm_proposals_public_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX crm_proposals_public_token_idx ON public.crm_proposals USING btree (public_token) WHERE (public_token IS NOT NULL);


--
-- Name: idx_cash_movements_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cash_movements_session ON public.register_cash_movements USING btree (session_id);


--
-- Name: idx_register_sessions_cashier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_register_sessions_cashier ON public.register_sessions USING btree (cashier_id);


--
-- Name: idx_register_sessions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_register_sessions_status ON public.register_sessions USING btree (status);


--
-- Name: crm_campaigns crm_campaigns_set_industry; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER crm_campaigns_set_industry BEFORE INSERT ON public.crm_campaigns FOR EACH ROW EXECUTE FUNCTION public.crm_set_active_industry();


--
-- Name: crm_contacts crm_contacts_set_industry; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER crm_contacts_set_industry BEFORE INSERT ON public.crm_contacts FOR EACH ROW EXECUTE FUNCTION public.crm_set_active_industry();


--
-- Name: crm_customer_success crm_customer_success_set_industry; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER crm_customer_success_set_industry BEFORE INSERT ON public.crm_customer_success FOR EACH ROW EXECUTE FUNCTION public.crm_set_active_industry();


--
-- Name: crm_followups crm_followups_set_industry; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER crm_followups_set_industry BEFORE INSERT ON public.crm_followups FOR EACH ROW EXECUTE FUNCTION public.crm_set_active_industry();


--
-- Name: crm_installed_machines crm_installed_machines_set_industry; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER crm_installed_machines_set_industry BEFORE INSERT ON public.crm_installed_machines FOR EACH ROW EXECUTE FUNCTION public.crm_set_active_industry();


--
-- Name: crm_leads crm_leads_set_industry; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER crm_leads_set_industry BEFORE INSERT ON public.crm_leads FOR EACH ROW EXECUTE FUNCTION public.crm_set_active_industry();


--
-- Name: crm_machine_consumables crm_machine_consumables_set_industry; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER crm_machine_consumables_set_industry BEFORE INSERT ON public.crm_machine_consumables FOR EACH ROW EXECUTE FUNCTION public.crm_set_active_industry();


--
-- Name: crm_machine_replacement_opportunities crm_machine_replacement_opportunities_set_industry; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER crm_machine_replacement_opportunities_set_industry BEFORE INSERT ON public.crm_machine_replacement_opportunities FOR EACH ROW EXECUTE FUNCTION public.crm_set_active_industry();


--
-- Name: crm_payment_reminders crm_payment_reminders_set_industry; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER crm_payment_reminders_set_industry BEFORE INSERT ON public.crm_payment_reminders FOR EACH ROW EXECUTE FUNCTION public.crm_set_active_industry();


--
-- Name: crm_proposals crm_proposals_set_industry; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER crm_proposals_set_industry BEFORE INSERT ON public.crm_proposals FOR EACH ROW EXECUTE FUNCTION public.crm_set_active_industry();


--
-- Name: crm_campaigns set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.crm_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: crm_contacts set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.crm_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: crm_followups set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.crm_followups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: crm_leads set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.crm_leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: crm_proposals set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.crm_proposals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: crm_templates set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.crm_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: crm_lead_contact_persons crm_lead_contact_persons_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_contact_persons
    ADD CONSTRAINT crm_lead_contact_persons_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.crm_leads(id) ON DELETE CASCADE;


--
-- Name: crm_machine_consumables crm_machine_consumables_machine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_machine_consumables
    ADD CONSTRAINT crm_machine_consumables_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES public.crm_installed_machines(id) ON DELETE CASCADE;


--
-- Name: crm_machine_replacement_opportunities crm_machine_replacement_opportunities_machine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_machine_replacement_opportunities
    ADD CONSTRAINT crm_machine_replacement_opportunities_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES public.crm_installed_machines(id) ON DELETE SET NULL;


--
-- Name: crm_machine_service_attachments crm_machine_service_attachments_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_machine_service_attachments
    ADD CONSTRAINT crm_machine_service_attachments_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.crm_machine_services(id) ON DELETE CASCADE;


--
-- Name: crm_machine_services crm_machine_services_machine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_machine_services
    ADD CONSTRAINT crm_machine_services_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES public.crm_installed_machines(id) ON DELETE CASCADE;


--
-- Name: export_documents export_documents_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_documents
    ADD CONSTRAINT export_documents_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.export_orders(id) ON DELETE SET NULL;


--
-- Name: export_documents export_documents_shipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_documents
    ADD CONSTRAINT export_documents_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES public.export_shipments(id) ON DELETE SET NULL;


--
-- Name: export_orders export_orders_quotation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_orders
    ADD CONSTRAINT export_orders_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.export_quotations(id) ON DELETE SET NULL;


--
-- Name: export_packing_dispatch export_packing_dispatch_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_packing_dispatch
    ADD CONSTRAINT export_packing_dispatch_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.export_orders(id) ON DELETE SET NULL;


--
-- Name: export_payments export_payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_payments
    ADD CONSTRAINT export_payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.export_orders(id) ON DELETE SET NULL;


--
-- Name: export_purchase_enquiries export_purchase_enquiries_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_purchase_enquiries
    ADD CONSTRAINT export_purchase_enquiries_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.export_vendors(id) ON DELETE SET NULL;


--
-- Name: export_quotations export_quotations_rfq_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_quotations
    ADD CONSTRAINT export_quotations_rfq_id_fkey FOREIGN KEY (rfq_id) REFERENCES public.export_rfqs(id) ON DELETE SET NULL;


--
-- Name: export_rfqs export_rfqs_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_rfqs
    ADD CONSTRAINT export_rfqs_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.export_products(id) ON DELETE SET NULL;


--
-- Name: export_shipments export_shipments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_shipments
    ADD CONSTRAINT export_shipments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.export_orders(id) ON DELETE SET NULL;


--
-- Name: hrms_attendance hrms_attendance_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrms_attendance
    ADD CONSTRAINT hrms_attendance_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.hrms_employees(id) ON DELETE CASCADE;


--
-- Name: hrms_leave_requests hrms_leave_requests_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrms_leave_requests
    ADD CONSTRAINT hrms_leave_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.hrms_employees(id) ON DELETE CASCADE;


--
-- Name: hrms_payroll hrms_payroll_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrms_payroll
    ADD CONSTRAINT hrms_payroll_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.hrms_employees(id) ON DELETE CASCADE;


--
-- Name: real_estate_bookings real_estate_bookings_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.real_estate_bookings
    ADD CONSTRAINT real_estate_bookings_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.real_estate_properties(id) ON DELETE SET NULL;


--
-- Name: real_estate_payments real_estate_payments_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.real_estate_payments
    ADD CONSTRAINT real_estate_payments_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.real_estate_bookings(id) ON DELETE SET NULL;


--
-- Name: real_estate_site_visits real_estate_site_visits_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.real_estate_site_visits
    ADD CONSTRAINT real_estate_site_visits_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.real_estate_properties(id) ON DELETE SET NULL;


--
-- Name: register_cash_movements register_cash_movements_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.register_cash_movements
    ADD CONSTRAINT register_cash_movements_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.register_sessions(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: crm_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_campaigns crm_campaigns_industry_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_campaigns_industry_policy ON public.crm_campaigns USING ((crm_industry = ( SELECT crm_settings.crm_industry
   FROM public.crm_settings
  WHERE (crm_settings.id = 1)))) WITH CHECK ((crm_industry = ( SELECT crm_settings.crm_industry
   FROM public.crm_settings
  WHERE (crm_settings.id = 1))));


--
-- Name: crm_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_contacts crm_contacts_industry_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_contacts_industry_policy ON public.crm_contacts USING ((crm_industry = ( SELECT crm_settings.crm_industry
   FROM public.crm_settings
  WHERE (crm_settings.id = 1)))) WITH CHECK ((crm_industry = ( SELECT crm_settings.crm_industry
   FROM public.crm_settings
  WHERE (crm_settings.id = 1))));


--
-- Name: crm_customer_success; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_customer_success ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_customer_success crm_customer_success_industry_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_customer_success_industry_policy ON public.crm_customer_success USING ((crm_industry = ( SELECT crm_settings.crm_industry
   FROM public.crm_settings
  WHERE (crm_settings.id = 1)))) WITH CHECK ((crm_industry = ( SELECT crm_settings.crm_industry
   FROM public.crm_settings
  WHERE (crm_settings.id = 1))));


--
-- Name: crm_followups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_followups ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_followups crm_followups_industry_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_followups_industry_policy ON public.crm_followups USING ((crm_industry = ( SELECT crm_settings.crm_industry
   FROM public.crm_settings
  WHERE (crm_settings.id = 1)))) WITH CHECK ((crm_industry = ( SELECT crm_settings.crm_industry
   FROM public.crm_settings
  WHERE (crm_settings.id = 1))));


--
-- Name: crm_installed_machines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_installed_machines ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_installed_machines crm_installed_machines_industry_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_installed_machines_industry_policy ON public.crm_installed_machines USING ((crm_industry = ( SELECT crm_settings.crm_industry
   FROM public.crm_settings
  WHERE (crm_settings.id = 1)))) WITH CHECK ((crm_industry = ( SELECT crm_settings.crm_industry
   FROM public.crm_settings
  WHERE (crm_settings.id = 1))));


--
-- Name: crm_lead_contact_persons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_lead_contact_persons ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_leads crm_leads_industry_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_leads_industry_policy ON public.crm_leads USING ((crm_industry = ( SELECT crm_settings.crm_industry
   FROM public.crm_settings
  WHERE (crm_settings.id = 1)))) WITH CHECK ((crm_industry = ( SELECT crm_settings.crm_industry
   FROM public.crm_settings
  WHERE (crm_settings.id = 1))));


--
-- Name: crm_machine_consumables; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_machine_consumables ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_machine_consumables crm_machine_consumables_industry_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_machine_consumables_industry_policy ON public.crm_machine_consumables USING ((crm_industry = ( SELECT crm_settings.crm_industry
   FROM public.crm_settings
  WHERE (crm_settings.id = 1)))) WITH CHECK ((crm_industry = ( SELECT crm_settings.crm_industry
   FROM public.crm_settings
  WHERE (crm_settings.id = 1))));


--
-- Name: crm_machine_replacement_opportunities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_machine_replacement_opportunities ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_machine_replacement_opportunities crm_machine_replacement_opportunities_industry_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_machine_replacement_opportunities_industry_policy ON public.crm_machine_replacement_opportunities USING ((crm_industry = ( SELECT crm_settings.crm_industry
   FROM public.crm_settings
  WHERE (crm_settings.id = 1)))) WITH CHECK ((crm_industry = ( SELECT crm_settings.crm_industry
   FROM public.crm_settings
  WHERE (crm_settings.id = 1))));


--
-- Name: crm_payment_reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_payment_reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_payment_reminders crm_payment_reminders_industry_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_payment_reminders_industry_policy ON public.crm_payment_reminders USING ((crm_industry = ( SELECT crm_settings.crm_industry
   FROM public.crm_settings
  WHERE (crm_settings.id = 1)))) WITH CHECK ((crm_industry = ( SELECT crm_settings.crm_industry
   FROM public.crm_settings
  WHERE (crm_settings.id = 1))));


--
-- Name: crm_proposals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_proposals ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_proposals crm_proposals_industry_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_proposals_industry_policy ON public.crm_proposals USING ((crm_industry = ( SELECT crm_settings.crm_industry
   FROM public.crm_settings
  WHERE (crm_settings.id = 1)))) WITH CHECK ((crm_industry = ( SELECT crm_settings.crm_industry
   FROM public.crm_settings
  WHERE (crm_settings.id = 1))));


--
-- Name: crm_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: register_cash_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.register_cash_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: register_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.register_sessions ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict 4wOgJbfbVU1NzbVcZDwPdJWkdf4znhiVyt5w1qYNgiLF2IJu9cXHy1OQFQh1XJl

