"use client";

import { useState, useEffect } from "react";

export default function TeacherDashboard() {
  const [sessionId, setSessionId] = useState("");
  const [studentUrl, setStudentUrl] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMonitoring, setShowMonitoring] = useState(false);
  const [students, setStudents] = useState<any[]>([]);
  const [pusher, setPusher] = useState<any>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<string>("disconnected");

  // セッションID生成
  const generateSessionId = () => {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 11);
    return `session_${timestamp}_${randomStr}`;
  };

  // セッション作成
  const createSession = async () => {
    setLoading(true);
    try {
      const newSessionId = generateSessionId();

      // APIでセッション作成
      const response = await fetch("/api/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: newSessionId,
          createdAt: Date.now(),
        }),
      });

      if (response.ok) {
        const baseUrl = window.location.origin;
        const url = `${baseUrl}/student?session=${newSessionId}`;

        setSessionId(newSessionId);
        setStudentUrl(url);

        // QRコード生成
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
          url
        )}`;
        setQrCodeUrl(qrUrl);

        // 監視画面を表示
        setShowMonitoring(true);

        // Pusherでリアルタイム受信開始
        await startMonitoring(newSessionId);

        // 既存の学生データを取得
        await loadExistingStudents(newSessionId);

        console.log("✅ セッション作成:", newSessionId);
      } else {
        alert("セッションの作成に失敗しました");
      }
    } catch (error) {
      console.error("セッション作成エラー:", error);
      alert("エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  // 既存の学生データを取得
  const loadExistingStudents = async (sid: string) => {
    try {
      const response = await fetch(`/api/update-status?sessionId=${sid}`);
      const data = await response.json();

      if (data.success && data.students.length > 0) {
        console.log("📊 既存の学生データを読み込み:", data.students);
        setStudents(data.students);
      }
    } catch (error) {
      console.error("❌ 学生データの読み込みに失敗:", error);
    }
  };

  // 監視開始（Pusher接続）
  const startMonitoring = async (sessionId: string) => {
    try {
      setConnectionStatus("connecting");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🔌 Pusher接続を開始...");
      console.log("   Session ID:", sessionId);

      // Pusher設定を取得
      const configResponse = await fetch("/api/pusher-config");
      const config = await configResponse.json();

      console.log("🔑 Pusher設定を取得:");
      console.log("   Key:", config.key);
      console.log("   Cluster:", config.cluster);

      if (!config.key || config.key === "") {
        throw new Error("Pusher key is missing in environment variables");
      }

      // Pusherスクリプトを動的に読み込み
      await loadPusherScript();

      // @ts-ignore
      const Pusher = window.Pusher;

      if (!Pusher) {
        throw new Error("Pusher script not loaded");
      }

      const pusherInstance = new Pusher(config.key, {
        cluster: config.cluster,
        enabledTransports: ["ws", "wss"],
      });

      const channelName = `session-${sessionId}`;
      console.log("📡 Subscribing to channel:", channelName);

      const channel = pusherInstance.subscribe(channelName);

      channel.bind("pusher:subscription_succeeded", () => {
        console.log("✅ Pusherチャンネルに接続成功:", channelName);
        setConnectionStatus("connected");
      });

      channel.bind("pusher:subscription_error", (error: any) => {
        console.error("❌ Pusher接続エラー:", error);
        setConnectionStatus("error");
      });

      channel.bind("student-update", (data: any) => {
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("📥 学生更新を受信:");
        console.log("   Student:", JSON.stringify(data.student, null, 2));
        console.log("   Timestamp:", new Date(data.timestamp).toLocaleString());
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

        setStudents((prev) => {
          const index = prev.findIndex((s) => s.id === data.student.id);

          if (index >= 0) {
            // 既存の生徒を更新
            const updated = [...prev];
            updated[index] = data.student;
            console.log(
              `🔄 学生を更新: ${data.student.name} (${data.student.status})`
            );
            console.log(`📊 現在の生徒数: ${updated.length}`);
            return updated;
          } else {
            // 新しい生徒を追加
            console.log(`➕ 新しい学生を追加: ${data.student.name}`);
            const newList = [...prev, data.student];
            console.log(`📊 現在の生徒数: ${newList.length}`);
            return newList;
          }
        });
      });

      // すべてのイベントをリッスン（デバッグ用）
      channel.bind_global((eventName: string, data: any) => {
        console.log(`📨 Pusher event received: ${eventName}`, data);
      });

      setPusher(pusherInstance);
      console.log("📡 Pusher接続完了");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    } catch (error) {
      console.error("❌ Pusher接続エラー:", error);
      setConnectionStatus("error");
      alert("リアルタイム接続に失敗しました。ページを再読み込みしてください。");
    }
  };

  // Pusherスクリプトを読み込み
  const loadPusherScript = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      // 既に読み込まれている場合
      // @ts-ignore
      if (window.Pusher) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = "https://js.pusher.com/8.2.0/pusher.min.js";
      script.async = true;

      script.onload = () => {
        console.log("✅ Pusherスクリプト読み込み完了");
        resolve();
      };

      script.onerror = () => {
        console.error("❌ Pusherスクリプトの読み込みに失敗");
        reject(new Error("Failed to load Pusher script"));
      };

      document.body.appendChild(script);
    });
  };

  // URLコピー
  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(studentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("コピー失敗:", error);
    }
  };

  // 新しいセッション
  const resetSession = () => {
    // Pusher接続を切断
    if (pusher) {
      pusher.disconnect();
      setPusher(null);
    }

    setSessionId("");
    setStudentUrl("");
    setQrCodeUrl("");
    setShowMonitoring(false);
    setStudents([]);
    setConnectionStatus("disconnected");
  };

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (pusher) {
        pusher.disconnect();
      }
    };
  }, [pusher]);

  return (
    <div style={styles.container}>
      <div style={styles.wrapper}>
        {/* ヘッダー */}
        <div style={styles.header}>
          <h1 style={styles.title}>SleepGuard</h1>
          <p style={styles.subtitle}>授業中の居眠り監視システム</p>

          {/* 接続ステータス表示 */}
          {showMonitoring && (
            <div
              style={{
                ...styles.connectionBadge,
                ...(connectionStatus === "connected"
                  ? styles.connectionConnected
                  : connectionStatus === "connecting"
                  ? styles.connectionConnecting
                  : styles.connectionError),
              }}
            >
              {connectionStatus === "connected" && "🟢 接続中"}
              {connectionStatus === "connecting" && "🟡 接続中..."}
              {connectionStatus === "error" && "🔴 接続エラー"}
            </div>
          )}
        </div>

        {!sessionId ? (
          // セッション作成前
          <div style={styles.card}>
            <div style={styles.iconContainer}>
              <span style={styles.icon}>📚</span>
            </div>
            <h2 style={styles.cardTitle}>授業を開始</h2>
            <p style={styles.cardDesc}>セッションを作成して学生を招待します</p>

            <button
              onClick={createSession}
              disabled={loading}
              style={{
                ...styles.button,
                ...(loading ? styles.buttonDisabled : {}),
              }}
            >
              {loading ? "作成中..." : "🚀 授業を開始"}
            </button>
          </div>
        ) : (
          // セッション作成後
          <div>
            {/* 学生用URL表示 */}
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>✅ 授業を開始しました</h2>

              <div style={styles.section}>
                <label style={styles.label}>📱 学生用URL</label>
                <div style={styles.urlContainer}>
                  <input
                    type="text"
                    value={studentUrl}
                    readOnly
                    style={styles.urlInput}
                  />
                  <button onClick={copyUrl} style={styles.copyButton}>
                    {copied ? "✅" : "📋"}
                  </button>
                </div>
                {copied && <p style={styles.copySuccess}>コピーしました！</p>}
                <p style={styles.helpText}>このURLを学生に共有してください</p>
              </div>

              <button onClick={resetSession} style={styles.buttonSecondary}>
                新しい授業を開始
              </button>
            </div>

            {/* 監視画面 */}
            {showMonitoring && (
              <div style={styles.card}>
                <h2 style={styles.cardTitle}>📊 リアルタイム監視</h2>

                {students.length === 0 ? (
                  <div style={styles.emptyState}>
                    <div style={styles.emptyIcon}>👥</div>
                    <p style={styles.emptyText}>学生の参加を待っています...</p>
                    <p
                      style={{
                        fontSize: "12px",
                        color: "#999",
                        marginTop: "8px",
                      }}
                    >
                      学生がURLにアクセスして検知を開始すると、ここに表示されます
                    </p>
                  </div>
                ) : (
                  <div style={styles.studentGrid}>
                    {students.map((student) => (
                      <div
                        key={student.id}
                        style={{
                          ...styles.studentCard,
                          ...(student.status === "sleeping"
                            ? styles.studentSleeping
                            : student.status === "drowsy"
                            ? styles.studentDrowsy
                            : styles.studentActive),
                        }}
                      >
                        <div style={styles.studentHeader}>
                          <span style={styles.studentName}>
                            {student.name || "匿名"}
                          </span>
                          <span style={styles.studentStatus}>
                            {student.status === "active" && "✅"}
                            {student.status === "drowsy" && "😪"}
                            {student.status === "sleeping" && "😴"}
                            {student.status === "absent" && "❌"}
                          </span>
                        </div>
                        <div style={styles.studentDetails}>
                          <div style={styles.studentDetail}>
                            👁️{" "}
                            {student.eyesClosed ? "閉じている" : "開いている"}
                          </div>
                          <div style={styles.studentDetail}>
                            📍 {student.headDown ? "下向き" : "正常"}
                          </div>
                          {student.sleepDuration > 0 && (
                            <div style={styles.studentDetail}>
                              ⏱️ {student.sleepDuration.toFixed(1)}秒
                            </div>
                          )}
                        </div>
                        <div style={styles.studentTime}>
                          最終更新:{" "}
                          {new Date(student.lastUpdate).toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={styles.stats}>
                  <div style={styles.statItem}>
                    <div style={styles.statValue}>{students.length}</div>
                    <div style={styles.statLabel}>参加者</div>
                  </div>
                  <div style={styles.statItem}>
                    <div style={styles.statValue}>
                      {students.filter((s) => s.status === "active").length}
                    </div>
                    <div style={styles.statLabel}>集中中</div>
                  </div>
                  <div style={styles.statItem}>
                    <div style={styles.statValue}>
                      {students.filter((s) => s.status === "drowsy").length}
                    </div>
                    <div style={styles.statLabel}>眠そう</div>
                  </div>
                  <div style={styles.statItem}>
                    <div style={styles.statValue}>
                      {students.filter((s) => s.status === "sleeping").length}
                    </div>
                    <div style={styles.statLabel}>居眠り</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// スタイル
const styles = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#f5f5f5",
    padding: "20px",
  },
  wrapper: {
    maxWidth: "1200px",
    margin: "0 auto",
  },
  header: {
    textAlign: "center" as const,
    marginBottom: "40px",
    position: "relative" as const,
  },
  title: {
    fontSize: "48px",
    fontWeight: "bold" as const,
    color: "#333",
    margin: "0 0 10px 0",
  },
  subtitle: {
    fontSize: "18px",
    color: "#666",
    margin: 0,
  },
  connectionBadge: {
    display: "inline-block",
    marginTop: "12px",
    padding: "8px 16px",
    borderRadius: "20px",
    fontSize: "14px",
    fontWeight: "bold" as const,
  },
  connectionConnected: {
    backgroundColor: "#d4edda",
    color: "#155724",
  },
  connectionConnecting: {
    backgroundColor: "#fff3cd",
    color: "#856404",
  },
  connectionError: {
    backgroundColor: "#f8d7da",
    color: "#721c24",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: "12px",
    padding: "40px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    marginBottom: "20px",
  },
  iconContainer: {
    textAlign: "center" as const,
    marginBottom: "20px",
  },
  icon: {
    fontSize: "64px",
  },
  cardTitle: {
    fontSize: "28px",
    fontWeight: "bold" as const,
    color: "#333",
    textAlign: "center" as const,
    margin: "0 0 10px 0",
  },
  cardDesc: {
    fontSize: "16px",
    color: "#666",
    textAlign: "center" as const,
    margin: "0 0 30px 0",
  },
  button: {
    width: "100%",
    padding: "16px 24px",
    fontSize: "18px",
    fontWeight: "bold" as const,
    color: "#fff",
    backgroundColor: "#007bff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer" as const,
    transition: "background-color 0.2s",
  },
  buttonDisabled: {
    backgroundColor: "#ccc",
    cursor: "not-allowed" as const,
  },
  buttonSecondary: {
    width: "100%",
    padding: "12px 24px",
    fontSize: "16px",
    fontWeight: "bold" as const,
    color: "#333",
    backgroundColor: "#e9ecef",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer" as const,
    marginTop: "20px",
  },
  section: {
    marginBottom: "30px",
  },
  label: {
    display: "block",
    fontSize: "14px",
    fontWeight: "bold" as const,
    color: "#333",
    marginBottom: "8px",
  },
  urlContainer: {
    display: "flex",
    gap: "8px",
  },
  urlInput: {
    flex: 1,
    padding: "12px",
    fontSize: "14px",
    border: "2px solid #e0e0e0",
    borderRadius: "6px",
    fontFamily: "monospace",
  },
  copyButton: {
    padding: "12px 20px",
    fontSize: "18px",
    backgroundColor: "#007bff",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer" as const,
  },
  copySuccess: {
    fontSize: "14px",
    color: "#28a745",
    margin: "8px 0 0 0",
  },
  helpText: {
    fontSize: "13px",
    color: "#999",
    margin: "8px 0 0 0",
  },
  emptyState: {
    textAlign: "center" as const,
    padding: "60px 20px",
  },
  emptyIcon: {
    fontSize: "64px",
    marginBottom: "16px",
  },
  emptyText: {
    fontSize: "16px",
    color: "#999",
  },
  studentGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "16px",
    marginBottom: "20px",
  },
  studentCard: {
    padding: "16px",
    borderRadius: "8px",
    border: "2px solid",
  },
  studentActive: {
    backgroundColor: "#d4edda",
    borderColor: "#28a745",
  },
  studentDrowsy: {
    backgroundColor: "#fff3cd",
    borderColor: "#ffc107",
  },
  studentSleeping: {
    backgroundColor: "#f8d7da",
    borderColor: "#dc3545",
  },
  studentHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
  },
  studentName: {
    fontSize: "18px",
    fontWeight: "bold" as const,
    color: "#333",
  },
  studentStatus: {
    fontSize: "24px",
  },
  studentDetails: {
    marginBottom: "8px",
  },
  studentDetail: {
    fontSize: "14px",
    color: "#666",
    marginBottom: "4px",
  },
  studentTime: {
    fontSize: "12px",
    color: "#999",
  },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "16px",
    marginTop: "20px",
    padding: "20px",
    backgroundColor: "#f8f9fa",
    borderRadius: "8px",
  },
  statItem: {
    textAlign: "center" as const,
  },
  statValue: {
    fontSize: "32px",
    fontWeight: "bold" as const,
    color: "#007bff",
  },
  statLabel: {
    fontSize: "14px",
    color: "#666",
    marginTop: "4px",
  },
};
