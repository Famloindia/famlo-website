import { NextRequest, NextResponse } from "next/server";

import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { asString, type JsonRecord } from "@/lib/platform-utils";
import { createAdminSupabaseClient } from "@/lib/supabase";

function asObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function csvCell(value: unknown): string {
  const text = typeof value === "string" ? value : value == null ? "" : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const familyId = asString(request.nextUrl.searchParams.get("familyId"));
    const format = asString(request.nextUrl.searchParams.get("format")) ?? "json";
    if (!familyId) {
      return NextResponse.json({ ok: false, error: "familyId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authorizedResource = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!authorizedResource?.familyId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    if (!authorizedResource.isAdmin) {
      return NextResponse.json({ ok: false, error: "Operator access is required." }, { status: 403 });
    }

    const access = await loadHostProAccess(supabase, familyId);
    if (!access.allowed) {
      return NextResponse.json({ ok: false, error: "Famlo Pro is not active for this property." }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("channel_sync_jobs")
      .select("id,provider_code,job_type,status,payload,result,channex_task_id,created_at,processed_at,updated_at,last_error")
      .eq("family_id", familyId)
      .in("job_type", ["availability_update", "rate_update", "restriction_update", "full_sync"])
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;

    const rows = ((data ?? []) as JsonRecord[]).map((row) => {
      const payload = asObject(row.payload);
      const result = asObject(row.result);
      const taskIds = Array.isArray(result.task_ids) ? result.task_ids : [];
      return {
        job_id: asString(row.id),
        scenario_name: asString(payload.certification_scenario),
        payload_type: asString(row.job_type),
        provider: asString(row.provider_code),
        property: asString(payload.property_id),
        date_from: asString(payload.date_from) ?? asString(result.date_from),
        date_to: asString(payload.date_to) ?? asString(result.date_to),
        channex_task_id: asString(row.channex_task_id) ?? (typeof taskIds[0] === "string" ? taskIds[0] : null),
        status: asString(row.status),
        timestamp: asString(row.processed_at) ?? asString(row.created_at) ?? asString(row.updated_at),
        source_ui_action: asString(payload.source_ui_action),
        source_route: asString(payload.source_route),
        unsupported: Array.isArray(payload.unsupported) ? payload.unsupported : [],
        error: asString(row.last_error),
      };
    });

    if (format === "csv") {
      const header = [
        "scenario_name",
        "payload_type",
        "provider",
        "property",
        "date_from",
        "date_to",
        "channex_task_id",
        "status",
        "timestamp",
        "source_ui_action",
        "source_route",
        "unsupported",
        "error",
      ];
      const lines = [
        header.join(","),
        ...rows.map((row) =>
          [
            row.scenario_name,
            row.payload_type,
            row.provider,
            row.property,
            row.date_from,
            row.date_to,
            row.channex_task_id,
            row.status,
            row.timestamp,
            row.source_ui_action,
            row.source_route,
            Array.isArray(row.unsupported) ? row.unsupported.join("; ") : "",
            row.error,
          ]
            .map(csvCell)
            .join(",")
        ),
      ];
      return new NextResponse(lines.join("\n"), {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="famlo-channex-certification-${familyId}.csv"`,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      familyId,
      count: rows.length,
      rows,
      storage: {
        table: "channel_sync_jobs",
        task_id_column: "channex_task_id",
        payload_column: "payload",
        result_column: "result",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to export certification report." },
      { status: 500 }
    );
  }
}
