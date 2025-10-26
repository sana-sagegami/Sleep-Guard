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
    const { sessionId, studentId, timestamp } = body;

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📸 スマホ撮影トリガー送信");
    console.log("   Session ID:", sessionId);
    console.log("   Student ID:", studentId);
    console.log("   Timestamp:", new Date(timestamp).toLocaleString());
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    if (!sessionId || !studentId) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Pusherでスマホに撮影トリガーを送信
    const channelName = `session-${sessionId}`;
    await pusher.trigger(channelName, "trigger-capture", {
      studentId: studentId,
      timestamp: timestamp || Date.now(),
      message: "📸 居眠りを検知しました。写真を撮影してください。",
    });

    console.log("✅ スマホに撮影トリガーを送信しました");

    return NextResponse.json({
      success: true,
      message: "Trigger sent to smartphone",
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("❌ 撮影トリガーエラー:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to trigger smartphone capture",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
