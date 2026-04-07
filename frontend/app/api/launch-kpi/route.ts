import { NextRequest, NextResponse } from "next/server";
import {
  formatLaunchKpiDashboardMarkdown,
  getLaunchKpiDashboardSnapshot,
  parseLaunchKpiWindowDays,
} from "@/lib/server/launch-kpi-dashboard";

const DASHBOARD_AUTH_TOKEN =
  process.env.AEGIS_LAUNCH_KPI_DASHBOARD_AUTH_TOKEN?.trim() ?? "";

function isAuthorized(request: NextRequest): boolean {
  const header = request.headers.get("authorization")?.trim() ?? "";
  return header === `Bearer ${DASHBOARD_AUTH_TOKEN}`;
}

function wantsMarkdown(request: NextRequest): boolean {
  const format = request.nextUrl.searchParams.get("format")?.trim().toLowerCase();
  return format === "md" || format === "markdown";
}

export async function GET(request: NextRequest) {
  if (!DASHBOARD_AUTH_TOKEN) {
    return NextResponse.json(
      {
        error: "Launch KPI dashboard auth token is not configured",
        detail:
          "Set AEGIS_LAUNCH_KPI_DASHBOARD_AUTH_TOKEN before using /api/launch-kpi.",
      },
      { status: 503 }
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  let windowDays: number;
  try {
    windowDays = parseLaunchKpiWindowDays(
      request.nextUrl.searchParams.get("days")
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Invalid days parameter",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 400 }
    );
  }

  try {
    const snapshot = await getLaunchKpiDashboardSnapshot(windowDays);

    if (wantsMarkdown(request)) {
      return new NextResponse(formatLaunchKpiDashboardMarkdown(snapshot), {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
        },
      });
    }

    return NextResponse.json(snapshot, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to generate launch KPI dashboard",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
