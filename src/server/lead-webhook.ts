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
    city?: string;
    destination?: string;
    departure_date?: string;
    return_date?: string;
    travelers?: string | number;
    adults?: string | number;
    children?: string | number;
    package?: string;
    tent?: string;
    budget?: string;
    message?: string;
    remarks_formatted?: string;
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

/**
 * Normalizes any phone string to strict 10 digits without spaces, +91, 91, or leading 0
 */
export function clean10DigitPhone(raw?: string | null): string {
  if (!raw) return "";
  let digits = String(raw).replace(/\D/g, "");
  // If 12 digits starting with 91 (India country code), strip 91
  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  }
  // Strip leading zeroes
  digits = digits.replace(/^0+/, "");
  // If longer than 10 digits, extract the rightmost 10 digits
  if (digits.length > 10) {
    digits = digits.slice(-10);
  }
  return digits;
}

function buildRemarksFromPayload(lead: any = {}, attribution: any = {}): string {
  if (lead.remarks_formatted && lead.remarks_formatted.trim().length > 0) {
    return lead.remarks_formatted;
  }

  const lines: string[] = [];
  lines.push("--- Travel Inquiry Form Details ---");
  if (lead.name) lines.push(`Name: ${lead.name}`);
  if (lead.phone) lines.push(`Phone: ${clean10DigitPhone(lead.phone)}`);
  if (lead.email) lines.push(`Email: ${lead.email}`);
  if (lead.city) lines.push(`City: ${lead.city}`);
  if (lead.check_in_date || lead.departure_date) lines.push(`Check In Date: ${lead.check_in_date || lead.departure_date}`);
  if (lead.adults || lead.travelers) lines.push(`Add Adult: ${lead.adults || lead.travelers}`);
  if (lead.children) lines.push(`Add Child 0-6 Years: ${lead.children}`);
  if (lead.package) lines.push(`Select Package: ${lead.package}`);
  if (lead.tent) lines.push(`Select Tent: ${lead.tent}`);
  if (lead.destination && lead.destination !== lead.tent && lead.destination !== lead.package) {
    lines.push(`Destination: ${lead.destination}`);
  }
  if (lead.return_date) lines.push(`Return Date: ${lead.return_date}`);
  if (lead.budget) lines.push(`Budget: ${lead.budget}`);
  if (lead.message) lines.push(`Message: ${lead.message}`);

  if (lead.custom_fields && typeof lead.custom_fields === "object") {
    let extraHeader = false;
    for (const [k, v] of Object.entries(lead.custom_fields)) {
      if (v !== null && v !== undefined && v !== "") {
        if (!extraHeader) {
          lines.push("");
          lines.push("--- Additional Custom Fields ---");
          extraHeader = true;
        }
        const label = k.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        lines.push(`${label}: ${v}`);
      }
    }
  }

  lines.push("");
  lines.push("--- Page & Attribution Info ---");
  if (attribution.page_url) lines.push(`Page URL: ${attribution.page_url}`);
  if (attribution.form_title) lines.push(`Form Title: ${attribution.form_title}`);
  if (attribution.utm_source) lines.push(`Campaign Source: ${attribution.utm_source}`);
  if (attribution.submitted_at) lines.push(`Submitted At: ${attribution.submitted_at}`);

  return lines.join("\n");
}

export async function handleLeadWebhook(request: Request): Promise<Response> {
  if (request.method === "GET") {
    return new Response(
      JSON.stringify({
        status: "ok",
        service: "TeleNexus Travel Leads Ingestion Webhook",
        version: "1.2.0",
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
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
        JSON.stringify({ status: "error", message: "Malformed JSON payload" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

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
        JSON.stringify({ status: "error", message: "Missing Unique Account Code." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

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
      token.startsWith("tnx_live_");

    if (!isValidToken) {
      return new Response(
        JSON.stringify({ status: "error", message: "Invalid integration code." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

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

    // Strictly clean phone number to 10 digits
    const cleanPhone = clean10DigitPhone(lead.phone);
    if (cleanPhone) {
      lead.phone = cleanPhone;
    }

    if (!lead.name && !cleanPhone && !lead.email) {
      return new Response(
        JSON.stringify({ status: "error", message: "Lead must contain at least a name, phone, or email." }),
        { status: 422, headers: { "Content-Type": "application/json" } }
      );
    }

    const travelRemarks = buildRemarksFromPayload(lead, attribution);

    // 1. Try admin client if service role key exists
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const { supabaseAdmin } = await import("../integrations/supabase/client.server");

        // Remarks require an author; attribute website inquiries to the first admin
        const { data: adminRole } = await (supabaseAdmin.from("user_roles") as any)
          .select("user_id")
          .eq("role", "admin")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        const systemUserId = adminRole?.user_id ?? null;


        // Check for duplicate phone number in leads
        let existingLead: any = null;
        if (cleanPhone && cleanPhone.length >= 7) {
          const { data: found } = await (supabaseAdmin.from("leads") as any)
            .select("id, name, phone_number, last_remark")
            .or(`phone_number.eq.${cleanPhone},phone_number.ilike.%${cleanPhone}%`)
            .order("id", { ascending: false })
            .limit(1)
            .maybeSingle();
          existingLead = found;
        }

        if (existingLead) {
          // INSERT INTO duplicate_leads TABLE
          const { data: dupRecord } = await (supabaseAdmin.from("duplicate_leads") as any).insert({
            original_lead_id: existingLead.id,
            name: lead.name || "Website Traveler",
            phone_number: cleanPhone,
            email: lead.email || null,
            city: lead.city || lead.destination || null,
            source: payload.lead_source || "WordPress CF7",
            remarks: travelRemarks,
            raw_payload: payload,
          }).select("id").maybeSingle();

          try {
            await (supabaseAdmin.from("lead_remarks") as any).insert({
              lead_id: existingLead.id,
              remark: `[Duplicate Lead Inquiry Received via WordPress]\n${travelRemarks}`,
            });
            await (supabaseAdmin.from("leads") as any).update({
              last_remark: `[Duplicate Inquiry ${new Date().toLocaleDateString()}] ${travelRemarks.slice(0, 150)}...`,
              updated_at: new Date().toISOString(),
            }).eq("id", existingLead.id);
          } catch (rErr) {}

          return new Response(
            JSON.stringify({
              status: "success",
              is_duplicate: true,
              duplicate_id: dupRecord?.id,
              original_lead_id: existingLead.id,
              message: "Mobile number exists in CRM. Inquiry saved to Duplicate Leads table and linked to original lead timeline."
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        // NEW UNIQUE LEAD:
        const { data: defaultStatus } = await supabaseAdmin
          .from("lead_statuses")
          .select("id")
          .eq("is_default", true)
          .limit(1)
          .maybeSingle();

        const { data: insertedLead, error: insertError } = await supabaseAdmin
          .from("leads")
          .insert({
            name: lead.name || "Website Traveler",
            phone_number: cleanPhone || null,
            email: lead.email || null,
            city: lead.city || lead.destination || null,
            source: payload.lead_source || "WordPress CF7",
            lead_received_date: new Date().toISOString().slice(0, 10),
            last_remark: travelRemarks,
            status_id: defaultStatus?.id || null,
          } as any)
          .select("id")
          .single();

        if (!insertError && insertedLead) {
          try {
            await (supabaseAdmin.from("lead_remarks") as any).insert({
              lead_id: insertedLead.id,
              remark: travelRemarks,
            });
          } catch (rErr) {}

          return new Response(
            JSON.stringify({
              status: "success",
              is_duplicate: false,
              lead_id: insertedLead.id,
              message: "Travel lead captured and queued for telecallers."
            }),
            { status: 201, headers: { "Content-Type": "application/json" } }
          );
        }
      } catch (adminErr) {
        console.warn("[TeleNexus Webhook] Admin insert attempt failed, trying RPC:", adminErr);
      }
    }

    // 2. Call RPC function (SECURITY DEFINER)
    const { data: rpcResult, error: rpcError } = await (supabase.rpc as any)(
      "ingest_wordpress_lead",
      {
        _token: token,
        _lead: {
          ...lead,
          phone: cleanPhone || lead.phone,
          remarks_formatted: travelRemarks
        },
        _attribution: {
          ...attribution,
          lead_source: payload.lead_source || "WordPress Contact Form 7"
        }
      }
    );

    if (!rpcError && rpcResult && (rpcResult as any).success) {
      const isDup = (rpcResult as any).is_duplicate || false;
      return new Response(
        JSON.stringify({
          status: "success",
          is_duplicate: isDup,
          lead_id: (rpcResult as any).lead_id,
          duplicate_id: (rpcResult as any).duplicate_id,
          original_lead_id: (rpcResult as any).original_lead_id,
          message: (rpcResult as any).message || "Lead captured successfully in TeleNexus."
        }),
        { status: isDup ? 200 : 201, headers: { "Content-Type": "application/json" } }
      );
    }

    if (rpcError) {
      console.error("[TeleNexus Webhook] RPC error:", rpcError);
      return new Response(
        JSON.stringify({
          status: "error",
          message: "Database function ingest_wordpress_lead returned error: " + rpcError.message
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        status: "error",
        message: (rpcResult as any)?.message || "Failed to save lead."
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("[TeleNexus Webhook] Unhandled exception:", err);
    return new Response(
      JSON.stringify({
        status: "error",
        message: "Internal server error: " + (err.message || String(err))
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
