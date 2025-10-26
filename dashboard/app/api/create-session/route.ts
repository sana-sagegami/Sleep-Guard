// app/api/create-session/route.ts
// セッション作成API

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

// セッション保存用（メモリ - 簡易版）
// 本番環境ではデータベースを使用してください
const sessions = new Map<string, any>();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId, teacherName, createdAt } = body;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "Session ID is required" },
        { status: 400 }
      );
    }

    // セッション情報を保存
    const sessionData = {
      id: sessionId,
      teacherName: teacherName || "先生",
      createdAt: createdAt || Date.now(),
      students: [],
      active: true,
    };

    sessions.set(sessionId, sessionData);

    console.log("✅ セッション作成成功:", sessionId);
    console.log("   先生:", teacherName);
    console.log("   作成日時:", new Date(createdAt).toLocaleString());

    return NextResponse.json({
      success: true,
      session: sessionData,
    });
  } catch (error) {
    console.error("❌ セッション作成エラー:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create session",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    // すべてのセッションを返す
    const sessionList = Array.from(sessions.values());

    // アクティブなセッションのみフィルタ（オプション）
    const activeSessions = sessionList.filter((s) => s.active);

    console.log("📊 セッション一覧取得:", activeSessions.length, "件");

    return NextResponse.json({
      success: true,
      sessions: activeSessions,
      total: activeSessions.length,
    });
  } catch (error) {
    console.error("❌ セッション取得エラー:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch sessions",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// セッション削除（オプション）
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "Session ID is required" },
        { status: 400 }
      );
    }

    if (sessions.has(sessionId)) {
      sessions.delete(sessionId);
      console.log("🗑️ セッション削除:", sessionId);

      return NextResponse.json({
        success: true,
        message: "Session deleted",
      });
    } else {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error("❌ セッション削除エラー:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete session",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
