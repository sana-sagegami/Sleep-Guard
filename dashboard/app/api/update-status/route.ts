import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "ClassGuard Dashboard API is running",
    timestamp: Date.now(),
  });
}
