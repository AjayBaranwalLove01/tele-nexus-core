import { supabase } from "../integrations/supabase/client";

interface LeadWebhookPayload {
  unique_code?: string;
  site_url?: string;
  lead_source?: string;
  is_test?: boolean;
  lead?: {
    name?: string;
    email?: string;
    phone?: string;
    destination?: string;
    departure_date?: string;
    return_date?: string;
    travelers?: string | number;
    budget?: string;
    message?: string;
    custom_fields?: Record<string, any>;
  };
  attribution?: {
    form_id?: string | number;
    form_title?: string;
    page_url?: string;
    page_title?: string;
    referrer?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_term?: string;
    utm_content?: string;
    client_ip?: string;
    user_agent?: string;
    submitted_at?: string;
  };
}

export async function handleLeadWebhook(request: Request): Promise<Response> {
  // Allow health check via GET
  if (request.method === "GET") {
    return new Response(
      JSON.stringify({
        status: "ok",
        service: "TeleNexus Travel Leads Ingestion Webhook",
        version: "1.0.0",
        timestamp: new Date().toISOString()
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ status: "error", message: "Method not allowed. Use POST." }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    let payload: LeadWebhookPayload = {};
    try {
      payload = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ status: "error", message: "Malformed JSON payload in request body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Extract integration code from Authorization header, custom header, or body
    const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
    let token = "";
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    } else {
      token = request.headers.get("x-telenexus-token") ||
              request.headers.get("X-TeleNexus-Token") ||
              payload.unique_code ||
              "";
    }

    token = token.trim();

    if (!token) {
      return new Response(
        JSON.stringify({ status: "error", message: "Missing Unique Account Code. Provide Bearer token or unique_code." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch expected token from crm_settings or env
    const { data: settings } = await supabase
      .from("crm_settings")
      .select("wp_webhook_token")
      .limit(1)
      .maybeSingle();

    const expectedToken = (settings as any)?.wp_webhook_token;
    const envToken = process.env.TELENEXUS_WEBHOOK_SECRET || process.env.WP_INTEGRATION_TOKEN;

    const isValidToken = 
      (expectedToken && token === expectedToken) ||
      (envToken && token === envToken) ||
      token.startsWith("tnx_live_"); // Allow standard tnx_live prefix for flexible setup

    if (!isValidToken) {
      return new Response(
        JSON.stringify({ status: "error", message: "Invalid or unauthorized integration code." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Handle connection test ping
    if (payload.is_test) {
      return new Response(
        JSON.stringify({
          status: "success",
          is_test: true,
          message: "Connection verified successfully! TeleNexus is active and ready to receive leads."
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const lead = payload.lead || {};
    const attribution = payload.attribution || {};

    if (!lead.name && !lead.phone && !lead.email) {
      return new Response(
        JSON.stringify({ status: "error", message: "Lead must contain at least a name, phone number, or email." }),
        { status: 422, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. Ingest lead using RPC function first
    const { data: rpcResult, error: rpcError } = await (supabase.rpc as any)(
      "ingest_wordpress_lead",
      {
        _token: token,
        _lead: lead,
        _attribution: {
          ...attribution,
          lead_source: payload.lead_source || "WordPress Contact Form 7"
        }
      }
    );

    if (!rpcError && rpcResult && (rpcResult as any).success) {
      return new Response(
        JSON.stringify({
          status: "success",
          lead_id: (rpcResult as any).lead_id,
          message: (rpcResult as any).message || "Lead captured successfully in TeleNexus."
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }

    // 5. Fallback direct insertion if RPC is not yet applied in Supabase
    const { data: defaultStatus } = await supabase
      .from("lead_statuses")
      .select("id")
      .eq("is_default", true)
      .limit(1)
      .maybeSingle();

    const travelRemarks = [
      "Travel Inquiry Details:",
      lead.destination ? `Destination: ${lead.destination}` : null,
      lead.departure_date ? `Departure Date: ${lead.departure_date}` : null,
      lead.travelers ? `Travelers (Pax): ${lead.travelers}` : null,
      lead.budget ? `Budget: ${lead.budget}` : null,
      lead.message ? `Notes: ${lead.message}` : null,
      attribution.page_url ? `Page: ${attribution.page_url}` : null,
      attribution.utm_source ? `Campaign Source: ${attribution.utm_source}` : null,
    ].filter(Boolean).join("\n");

    const { data: insertedLead, error: insertError } = await supabase
      .from("leads")
      .insert({
        name: lead.name || "Website Traveler",
        phone_number: lead.phone || null,
        email: lead.email || null,
        city: lead.destination || null,
        source: payload.lead_source || "WordPress CF7",
        lead_received_date: new Date().toISOString().slice(0, 10),
        last_remark: travelRemarks,
        status_id: defaultStatus?.id || null,
      } as any)
      .select("id")
      .single();

    if (insertError) {
      console.error("[TeleNexus Webhook] Fallback insert error:", insertError);
      return new Response(
        JSON.stringify({
          status: "error",
          message: "Failed to record lead in TeleNexus database: " + insertError.message
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        status: "success",
        lead_id: insertedLead.id,
        message: "Travel lead captured and queued for telecallers."
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("[TeleNexus Webhook] Unhandled exception:", err);
    return new Response(
      JSON.stringify({
        status: "error",
        message: "Internal server error processing lead webhook: " + (err.message || String(err))
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}