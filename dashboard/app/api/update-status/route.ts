import { NextRequest, NextResponse } from "next/server";
import Pusher from "pusher";

// Pusherサーバーを初期化
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID || "",
  key: process.env.NEXT_PUBLIC_PUSHER_KEY || "",
  secret: process.env.PUSHER_SECRET || "",
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "ap3",
  useTLS: true,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, student } = body;

    if (!sessionId || !student) {
      return NextResponse.json(
        { error: "セッションIDと生徒情報が必要です" },
        { status: 400 }
      );
    }

    // Pusherでブロードキャスト
    await pusher.trigger(`session-${sessionId}`, "student-update", student);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Pusher送信エラー:", error);
    return NextResponse.json({ error: "送信に失敗しました" }, { status: 500 });
  }
}
