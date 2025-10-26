// app/api/health/route.ts
// ヘルスチェックAPI

import { NextResponse } from "next/server";

export async function GET() {
  try {
    // システムステータスをチェック
    const healthData = {
      status: "ok",
      service: "ClassGuard API",
      version: "2.0.0",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
    };

    console.log("✅ ヘルスチェック:", healthData.status);

    return NextResponse.json(healthData, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("❌ ヘルスチェックエラー:", error);

    return NextResponse.json(
      {
        status: "error",
        service: "ClassGuard API",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
