// app/api/update-status/route.ts
// ステータス更新API（既存のものと同じ）

import { NextResponse } from "next/server";
import Pusher from "pusher";

// Pusher設定
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID || "",
  key: process.env.NEXT_PUBLIC_PUSHER_KEY || "",
  secret: process.env.PUSHER_SECRET || "",
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "ap3",
  useTLS: true,
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId, student } = body;

    // バリデーション
    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "Session ID is required" },
        { status: 400 }
      );
    }

    if (!student || !student.id) {
      return NextResponse.json(
        { success: false, error: "Student data is required" },
        { status: 400 }
      );
    }

    // Pusherでリアルタイム送信
    const channelName = `session-${sessionId}`;
    const eventName = "student-update";

    await pusher.trigger(channelName, eventName, {
      student: {
        id: student.id,
        name: student.name || "匿名",
        status: student.status || "active",
        eyesClosed: student.eyesClosed || false,
        headDown: student.headDown || false,
        sleepDuration: student.sleepDuration || 0,
        lastUpdate: student.lastUpdate || Date.now(),
      },
    });

    console.log("📤 ステータス送信成功:", {
      session: sessionId,
      student: student.id,
      status: student.status,
    });

    return NextResponse.json({
      success: true,
      message: "Status updated successfully",
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("❌ ステータス更新エラー:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update status",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// ヘルスチェック（オプション）
export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      status: "ok",
      service: "update-status",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Service unavailable" },
      { status: 503 }
    );
  }
}
