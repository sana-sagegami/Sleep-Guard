// ============================================
// ClassGuard サーバー
// WebSocketでリアルタイム通信を行う
// ============================================

const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const path = require("path");

// ============================================
// サーバー設定
// ============================================
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["polling", "websocket"],
  allowEIO3: true,
  // ngrok対応の追加設定
  pingTimeout: 60000,
  pingInterval: 25000,
});

const PORT = process.env.PORT || 3000;

// ミドルウェア
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ============================================
// メモリ内データストア（DBの代わり）
// ============================================
const sessions = {}; // 授業セッション
// sessions[sessionId] = {
//     startTime: timestamp,
//     status: 'active',
//     students: {
//         anonymousId: { status: 'awake/sleeping', lastUpdate: timestamp }
//     },
//     stats: { totalStudents: 0, sleepingCount: 0, awakeCount: 0 }
// }

// ============================================
// ユーティリティ関数
// ============================================

/**
 * セッションIDを生成
 */
function generateSessionId() {
  return "cls_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
}

/**
 * セッションの統計を更新
 * @param {string} sessionId - セッションID
 */
function updateStats(sessionId) {
  const session = sessions[sessionId];
  if (!session) return;

  const students = Object.values(session.students);

  session.stats = {
    totalStudents: students.length,
    sleepingCount: students.filter((s) => s.status === "sleeping").length,
    awakeCount: students.filter((s) => s.status === "awake").length,
    lastUpdate: Date.now(),
  };

  console.log(
    `[統計更新] セッション: ${sessionId}, 合計: ${session.stats.totalStudents}, 居眠り: ${session.stats.sleepingCount}`
  );
}

/**
 * 古いセッションを削除（3時間以上経過）
 */
function cleanupOldSessions() {
  const now = Date.now();
  const THREE_HOURS = 3 * 60 * 60 * 1000;

  Object.keys(sessions).forEach((sessionId) => {
    const session = sessions[sessionId];
    if (now - session.startTime > THREE_HOURS) {
      console.log(`[クリーンアップ] 古いセッションを削除: ${sessionId}`);
      delete sessions[sessionId];
    }
  });
}

// 1時間ごとにクリーンアップ
setInterval(cleanupOldSessions, 60 * 60 * 1000);

// ============================================
// HTTP エンドポイント
// ============================================

/**
 * ルートページ
 */
app.get("/", (req, res) => {
  res.send(`
        <html>
        <head>
            <title>ClassGuard Server</title>
            <style>
                body { font-family: sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
                h1 { color: #2196F3; }
                .status { background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; }
                a { color: #2196F3; text-decoration: none; font-weight: 600; }
                a:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <h1>📊 ClassGuard Server</h1>
            <div class="status">
                <p>✅ サーバーは正常に動作しています</p>
                <p>ポート: ${PORT}</p>
                <p>アクティブなセッション: ${Object.keys(sessions).length}</p>
            </div>
            <p><a href="/teacher.html">→ 教員用ダッシュボード</a></p>
        </body>
        </html>
    `);
});

/**
 * ヘルスチェック
 */
app.get("/socket.io/health", (req, res) => {
  res.json({
    status: "OK",
    socketio: "ready",
    timestamp: new Date().toISOString(),
  });
});

/**
 * セッション一覧(デバッグ用)
 */
app.get("/api/sessions", (req, res) => {
  res.json(sessions);
});

/**
 * 生徒のステータス更新 (Chrome拡張機能から)
 */
app.post("/api/status", (req, res) => {
  const { sessionId, studentId, status, timestamp } = req.body;

  console.log("📬 ステータス受信:", { sessionId, studentId, status });

  // バリデーション
  if (!sessionId || !studentId || !status) {
    return res.status(400).json({
      success: false,
      error: "sessionId, studentId, status are required",
    });
  }

  // セッションが存在するか確認
  if (!sessions[sessionId]) {
    return res.status(404).json({
      success: false,
      error: "Session not found",
    });
  }

  // 生徒情報を更新
  if (!sessions[sessionId].students[studentId]) {
    sessions[sessionId].students[studentId] = {
      id: studentId,
      status: status,
      lastUpdate: timestamp || Date.now(),
      connected: true,
    };
    console.log("✨ 新しい生徒が接続:", studentId);
  } else {
    sessions[sessionId].students[studentId].status = status;
    sessions[sessionId].students[studentId].lastUpdate =
      timestamp || Date.now();
    sessions[sessionId].students[studentId].connected = true;
  }

  // 統計を更新
  updateStats(sessionId);

  // 教員側に更新を通知（全体ブロードキャスト）
  io.of("/teacher").emit("update", {
    sessionId: sessionId,
    studentId: studentId,
    status: status,
    students: sessions[sessionId].students,
    stats: sessions[sessionId].stats,
  });

  console.log(
    `📊 統計更新: 合計=${sessions[sessionId].stats.totalStudents}, 起きている=${sessions[sessionId].stats.awakeCount}, 寝ている=${sessions[sessionId].stats.sleepingCount}`
  );

  res.json({
    success: true,
    message: "Status updated",
    stats: sessions[sessionId].stats,
  });
});

/**
 * キャプチャリクエスト (教員→スマホ)
 */
app.post("/api/capture-request", (req, res) => {
  const { sessionId, studentId } = req.body;

  console.log("📸 キャプチャリクエスト受信:", { sessionId, studentId });

  if (!sessionId || !studentId) {
    return res.status(400).json({
      success: false,
      error: "sessionId and studentId are required",
    });
  }

  if (!sessions[sessionId]) {
    return res.status(404).json({
      success: false,
      error: "Session not found",
    });
  }

  // スマホ側にキャプチャリクエストを送信
  io.emit("capture-request", { sessionId, studentId });

  console.log("📱 スマホへキャプチャリクエストを送信しました");

  res.json({
    success: true,
    message: "Capture request sent",
  });
});

// ============================================
// WebSocket: 教員側(Webページ)
// ============================================
io.of("/teacher").on("connection", (socket) => {
  console.log("👩‍🏫 教員が接続しました:", socket.id);

  // 授業開始
  socket.on("start", (callback) => {
    const sessionId = generateSessionId();

    // セッション作成
    sessions[sessionId] = {
      startTime: Date.now(),
      status: "active",
      students: {},
      stats: { totalStudents: 0, sleepingCount: 0, awakeCount: 0 },
    };

    console.log("📚 新しい授業セッションを開始しました");
    console.log("🔑 セッションID:", sessionId);
    console.log(
      "📱 Chrome拡張でこのセッションIDを入力してください: " + sessionId
    );
    console.log("=".repeat(60));

    // 教員をセッションに参加させる
    socket.join(sessionId);

    // コールバック応答
    if (callback) {
      callback({ sessionId, success: true });
    }

    // セッション作成を通知
    socket.emit("session-created", sessionId);

    // 定期的に統計を送信（5秒ごと）
    const statsInterval = setInterval(() => {
      if (sessions[sessionId]) {
        io.of("/teacher").emit("update", {
          sessionId: sessionId,
          students: sessions[sessionId].students,
          stats: sessions[sessionId].stats,
        });
      } else {
        clearInterval(statsInterval);
      }
    }, 5000);
  });

  // セッション参加
  socket.on("join-session", (sessionId) => {
    if (sessions[sessionId]) {
      socket.join(sessionId);
      console.log("👩‍🏫 教員がセッションに参加:", sessionId);

      // 現在の統計を送信
      socket.emit("update", sessions[sessionId].stats);
    }
  });

  // 授業終了
  socket.on("end", (sessionId) => {
    if (sessions[sessionId]) {
      sessions[sessionId].status = "ended";
      console.log("📚 授業セッション終了:", sessionId);

      // セッションの全員に終了を通知
      io.of("/teacher").to(sessionId).emit("session-ended");
      io.of("/student").to(sessionId).emit("session-ended");

      // セッションを削除
      delete sessions[sessionId];
    }
  });

  // 切断
  socket.on("disconnect", () => {
    console.log("👩‍🏫 教員が切断しました:", socket.id);
  });
});

// ============================================
// WebSocket: 学生側（Chrome拡張）
// ============================================
io.of("/student").on("connection", (socket) => {
  console.log("🎓 学生が接続しました:", socket.id);

  // セッション参加
  socket.on("join", ({ sessionId, studentId }) => {
    if (!sessions[sessionId]) {
      socket.emit("error", { message: "セッションが見つかりません" });
      return;
    }

    // 学生をセッションに参加
    socket.join(sessionId);
    socket.sessionId = sessionId;
    socket.studentId = studentId;

    // 学生を登録
    if (!sessions[sessionId].students[studentId]) {
      sessions[sessionId].students[studentId] = {
        status: "awake",
        lastUpdate: Date.now(),
        socketId: socket.id,
      };

      console.log("🎓 学生がセッションに参加:", studentId, "→", sessionId);
    }

    // 統計を更新
    updateStats(sessionId);

    // 教員に更新を通知
    io.of("/teacher").to(sessionId).emit("update", sessions[sessionId].stats);

    // 参加成功を通知
    socket.emit("joined", { sessionId, success: true });
  });

  // 学生のステータス更新
  socket.on("status", ({ sessionId, studentId, status }) => {
    if (sessions[sessionId] && sessions[sessionId].students[studentId]) {
      const oldStatus = sessions[sessionId].students[studentId].status;
      sessions[sessionId].students[studentId].status = status;
      sessions[sessionId].students[studentId].lastUpdate = Date.now();

      console.log(
        `📊 学生ステータス変更: ${studentId} ${oldStatus} → ${status}`
      );

      // 統計を更新
      updateStats(sessionId);

      // 教員に更新を通知
      io.of("/teacher").to(sessionId).emit("update", sessions[sessionId].stats);
    }
  });

  // 切断
  socket.on("disconnect", () => {
    console.log("🎓 学生が切断しました:", socket.id);

    // セッションから学生を削除
    if (socket.sessionId && socket.studentId) {
      const session = sessions[socket.sessionId];
      if (session && session.students[socket.studentId]) {
        console.log("🎓 学生がセッションから退出:", socket.studentId);
        delete session.students[socket.studentId];

        // 統計を更新
        updateStats(socket.sessionId);

        // 教員に更新を通知
        io.of("/teacher").to(socket.sessionId).emit("update", session.stats);
      }
    }
  });
});

// ============================================
// WebSocket: スマートフォン側（PWA）
// ============================================
io.on("connection", (socket) => {
  console.log("📱 スマホ接続:", socket.id);
  console.log("📡 Transport:", socket.conn.transport.name);

  // スマホとして参加
  socket.on("smartphone-join", (data) => {
    console.log("📱 スマホ参加要求:", data);
    socket.anonymousId = data.anonymousId;
    socket.deviceType = "smartphone";

    // 匿名IDのルームに参加
    socket.join(data.anonymousId);

    // 参加成功を返す
    socket.emit("joined", {
      success: true,
      anonymousId: data.anonymousId,
    });

    console.log(`✅ スマホ参加完了: ${data.anonymousId}`);
  });

  // 撮影指令（Chrome拡張から送信される）
  socket.on("request-capture", (anonymousId) => {
    console.log(`📸 撮影指令送信: ${anonymousId}`);
    // 該当する匿名IDのスマホに撮影を指示
    io.to(anonymousId).emit("capture");
  });

  // 撮影完了通知
  socket.on("capture-complete", (data) => {
    console.log("📸 撮影完了通知:", socket.anonymousId, data);
    // 必要に応じてChrome拡張に通知
  });

  // 切断
  socket.on("disconnect", () => {
    console.log("📱 スマホ切断:", socket.id);
    if (socket.anonymousId) {
      console.log(`   匿名ID: ${socket.anonymousId}`);
    }
  });
});

// ============================================
// HTTP API: Chrome拡張からスマホに撮影指令を送る
// ============================================
app.post("/api/capture-request", (req, res) => {
  const { studentId, sessionId } = req.body;

  console.log("📸 撮影指令受信:", { studentId, sessionId });

  if (!studentId) {
    return res.status(400).json({
      error: "studentIdが必要です",
    });
  }

  // 該当する匿名IDのスマホに撮影を指示
  io.to(studentId).emit("capture");

  console.log(`✅ 撮影指令送信完了: ${studentId}`);

  res.json({
    success: true,
    message: "撮影指令を送信しました",
  });
});

// ============================================
// 定期的な統計配信（10秒ごと）
// ============================================
setInterval(() => {
  Object.keys(sessions).forEach((sessionId) => {
    const session = sessions[sessionId];
    if (session.status === "active") {
      // 教員に最新の統計を送信
      io.of("/teacher").to(sessionId).emit("update", session.stats);
    }
  });
}, 10000); // 10秒

// ============================================
// サーバー起動
// ============================================
server.listen(PORT, () => {
  console.log("");
  console.log("================================================");
  console.log("  ClassGuard Server");
  console.log("================================================");
  console.log(`  ✓ サーバー起動: http://localhost:${PORT}`);
  console.log(`  ✓ 教員ダッシュボード: http://localhost:${PORT}/teacher.html`);
  console.log("================================================");
  console.log("");
});

// ============================================
// エラーハンドリング
// ============================================
process.on("uncaughtException", (err) => {
  console.error("予期しないエラー:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("未処理のPromise拒否:", err);
});

/**
 * ステータス送信用エンドポイント
 */
/**
 * Chrome拡張機能用: 学生ステータス更新
 */
app.post("/api/student-status", (req, res) => {
  const { sessionId, studentId, status, timestamp } = req.body;

  console.log("📡 Chrome拡張からステータス受信:", {
    sessionId,
    studentId,
    status,
  });

  if (!sessionId || !studentId || !status) {
    return res.status(400).json({
      error: "必須パラメータが不足しています",
    });
  }

  // セッションが存在するか確認
  if (!sessions[sessionId]) {
    console.warn("⚠️ セッションが見つかりません:", sessionId);
    return res.status(404).json({
      error: "セッションが見つかりません",
    });
  }

  // 学生を登録または更新
  if (!sessions[sessionId].students[studentId]) {
    sessions[sessionId].students[studentId] = {
      status: status,
      lastUpdate: timestamp,
    };
    console.log("🆕 新しい学生を登録:", studentId);
  } else {
    const oldStatus = sessions[sessionId].students[studentId].status;
    sessions[sessionId].students[studentId].status = status;
    sessions[sessionId].students[studentId].lastUpdate = timestamp;

    if (oldStatus !== status) {
      console.log(`📊 ステータス変更: ${studentId} ${oldStatus} → ${status}`);
    }
  }

  // 統計を更新
  updateStats(sessionId);

  // 教員に通知
  io.of("/teacher").to(sessionId).emit("update", sessions[sessionId].stats);

  res.json({ success: true });
});
