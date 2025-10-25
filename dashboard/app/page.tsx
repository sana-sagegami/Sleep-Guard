"use client";

import { useEffect, useState } from "react";
import Pusher from "pusher-js";
import "./dashboard.css";

interface Student {
  id: string;
  name: string;
  status: "active" | "drowsy" | "sleeping" | "offline";
  lastUpdate: number;
  eyesClosed: boolean;
  headDown: boolean;
  sleepDuration: number;
}

export default function TeacherDashboard() {
  const [students, setStudents] = useState<Student[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [pusher, setPusher] = useState<Pusher | null>(null);

  // セッション開始
  const startSession = () => {
    const newSessionId = generateSessionId();
    setSessionId(newSessionId);
    setIsConnected(true);

    // Pusherに接続
    connectToPusher(newSessionId);
  };

  // セッションIDを生成
  const generateSessionId = () => {
    return (
      "session_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9)
    );
  };

  // Pusherに接続
  const connectToPusher = (sessionId: string) => {
    // Pusherクライアントを初期化
    const pusherClient = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY || "", {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "ap3",
    });

    // チャンネルに接続
    const channel = pusherClient.subscribe(`session-${sessionId}`);

    // 生徒の状態更新を受信
    channel.bind("student-update", (data: Student) => {
      console.log("受信:", data);

      setStudents((prev) => {
        const existing = prev.find((s) => s.id === data.id);
        if (existing) {
          // 既存の生徒を更新
          return prev.map((s) => (s.id === data.id ? data : s));
        } else {
          // 新しい生徒を追加
          return [...prev, data];
        }
      });
    });

    // 生徒の退出を受信
    channel.bind("student-leave", (data: { id: string }) => {
      setStudents((prev) => prev.filter((s) => s.id !== data.id));
    });

    setPusher(pusherClient);
  };

  // セッション終了
  const endSession = () => {
    if (pusher) {
      pusher.disconnect();
      setPusher(null);
    }
    setIsConnected(false);
    setStudents([]);
    setSessionId("");
  };

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (pusher) {
        pusher.disconnect();
      }
    };
  }, [pusher]);

  // ステータス別の件数
  const statusCounts = {
    active: students.filter((s) => s.status === "active").length,
    drowsy: students.filter((s) => s.status === "drowsy").length,
    sleeping: students.filter((s) => s.status === "sleeping").length,
    offline: students.filter((s) => s.status === "offline").length,
  };

  // セッションURLを生成
  const sessionUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/student?session=${sessionId}`
      : "";

  return (
    <div className="dashboard">
      <header className="header">
        <h1>👨‍🏫 ClassGuard 先生用ダッシュボード</h1>
        <div className="header-actions">
          {!isConnected ? (
            <button className="btn-primary" onClick={startSession}>
              📡 新しいセッションを開始
            </button>
          ) : (
            <>
              <div className="session-info">
                <span className="session-label">セッションURL:</span>
                <code className="session-id">{sessionUrl}</code>
                <button
                  className="btn-copy"
                  onClick={() => navigator.clipboard.writeText(sessionUrl)}
                >
                  📋 コピー
                </button>
              </div>
              <button className="btn-danger" onClick={endSession}>
                ⏹️ セッション終了
              </button>
            </>
          )}
        </div>
      </header>

      {isConnected && (
        <>
          <div className="stats">
            <div className="stat-card stat-active">
              <div className="stat-icon">✅</div>
              <div className="stat-content">
                <div className="stat-label">集中中</div>
                <div className="stat-value">{statusCounts.active}</div>
              </div>
            </div>

            <div className="stat-card stat-drowsy">
              <div className="stat-icon">😪</div>
              <div className="stat-content">
                <div className="stat-label">眠そう</div>
                <div className="stat-value">{statusCounts.drowsy}</div>
              </div>
            </div>

            <div className="stat-card stat-sleeping">
              <div className="stat-icon">😴</div>
              <div className="stat-content">
                <div className="stat-label">居眠り</div>
                <div className="stat-value">{statusCounts.sleeping}</div>
              </div>
            </div>

            <div className="stat-card stat-total">
              <div className="stat-icon">👥</div>
              <div className="stat-content">
                <div className="stat-label">合計</div>
                <div className="stat-value">{students.length}</div>
              </div>
            </div>
          </div>

          {students.length === 0 && (
            <div className="waiting-state">
              <div className="waiting-icon">⏳</div>
              <h2>生徒の参加を待っています...</h2>
              <p>
                生徒に上記のURLを共有してください。
                <br />
                QRコードを表示することもできます。
              </p>
            </div>
          )}

          <div className="students-grid">
            {students.map((student) => (
              <div
                key={student.id}
                className={`student-card status-${student.status}`}
              >
                <div className="student-header">
                  <div className="student-avatar">{student.name.charAt(0)}</div>
                  <div className="student-info">
                    <h3>{student.name}</h3>
                    <span className={`status-badge status-${student.status}`}>
                      {getStatusText(student.status)}
                    </span>
                  </div>
                </div>

                <div className="student-details">
                  <div className="detail-row">
                    <span className="detail-label">👁️ 目の状態:</span>
                    <span className="detail-value">
                      {student.eyesClosed ? "❌ 閉じている" : "✅ 開いている"}
                    </span>
                  </div>

                  <div className="detail-row">
                    <span className="detail-label">📐 頭の角度:</span>
                    <span className="detail-value">
                      {student.headDown ? "❌ 下向き" : "✅ 正常"}
                    </span>
                  </div>

                  {student.sleepDuration > 0 && (
                    <div className="detail-row alert">
                      <span className="detail-label">⏱️ 経過時間:</span>
                      <span className="detail-value">
                        {student.sleepDuration}秒
                      </span>
                    </div>
                  )}

                  <div className="detail-row">
                    <span className="detail-label">🕐 最終更新:</span>
                    <span className="detail-value">
                      {new Date(student.lastUpdate).toLocaleTimeString("ja-JP")}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!isConnected && (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <h2>セッションを開始してください</h2>
          <p>
            「新しいセッションを開始」をクリックすると、
            <br />
            生徒が参加できるURLが発行されます。
          </p>
          <div className="features-list">
            <div className="feature-item">
              ✅ データは一時的（セッション終了で消去）
            </div>
            <div className="feature-item">✅ リアルタイム監視</div>
            <div className="feature-item">✅ PC・スマホどちらでも参加可能</div>
          </div>
        </div>
      )}
    </div>
  );
}

function getStatusText(status: string): string {
  const statusMap: { [key: string]: string } = {
    active: "✅ 集中中",
    drowsy: "😪 眠そう",
    sleeping: "😴 居眠り",
    offline: "⚫ オフライン",
  };
  return statusMap[status] || status;
}
