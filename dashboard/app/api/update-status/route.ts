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

// セッションごとの生徒データを保存（メモリ）
const sessionStudents = new Map<string, Map<string, any>>();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId, student } = body;

    console.log("📥 Received status update:", { sessionId, student });

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

    // セッションの生徒マップを取得または作成
    if (!sessionStudents.has(sessionId)) {
      sessionStudents.set(sessionId, new Map());
      console.log(`✨ Created new session: ${sessionId}`);
    }

    const students = sessionStudents.get(sessionId)!;

    // 生徒情報を更新
    const studentData = {
      id: student.id,
      name: student.name || "匿名",
      status: student.status || "active",
      eyesClosed: student.eyesClosed || false,
      headDown: student.headDown || false,
      sleepDuration: student.sleepDuration || 0,
      lastUpdate: Date.now(),
    };

    students.set(student.id, studentData);

    console.log(
      `✅ Student ${student.id} (${student.name}) updated: ${student.status}`
    );
    console.log(`📊 Total students in session: ${students.size}`);

    // Pusherでリアルタイム送信
    const channelName = `session-${sessionId}`;
    const eventName = "student-update";

    await pusher.trigger(channelName, eventName, {
      student: studentData,
      timestamp: Date.now(),
    });

    console.log(`📡 Pusher event sent to ${channelName}`);

    // 現在の全生徒リストを返す
    const studentList = Array.from(students.values());

    return NextResponse.json({
      success: true,
      message: "Status updated successfully",
      student: studentData,
      totalStudents: studentList.length,
      students: studentList,
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

// 生徒リストを取得するGETエンドポイント
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json({
        success: true,
        status: "ok",
        service: "update-status",
        timestamp: new Date().toISOString(),
        message: "No sessionId provided - returning health check",
      });
    }

    const students = sessionStudents.get(sessionId);
    const studentList = students ? Array.from(students.values()) : [];

    console.log(
      `📊 GET request for session ${sessionId}: ${studentList.length} students`
    );

    return NextResponse.json({
      success: true,
      sessionId: sessionId,
      students: studentList,
      total: studentList.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Get students error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to get students",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}