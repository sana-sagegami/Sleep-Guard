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
    const { sessionId, studentId, image, timestamp } = body;

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📸 スマホ撮影データ受信（ローカル保存のみ）");
    console.log("   Session ID:", sessionId);
    console.log("   Student ID:", studentId);
    console.log("   Timestamp:", new Date(timestamp).toLocaleString());
    console.log("   Image size:", image?.length || 0, "bytes");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    if (!sessionId || !studentId || !image) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // データを受信したことをログに記録するのみ
    // 教師画面には送信しない
    console.log("✅ 撮影データを受信しました（教師画面には非送信）");

    return NextResponse.json({
      success: true,
      message: "Capture received and stored locally",
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("❌ スマホ撮影データエラー:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process capture",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
