// ============================================
// グローバル変数
// ============================================

let pusher = null;
let channel = null;
let sessionId = null;
let studentId = null;
let cameraStream = null;
let captureCount = 0;
let html5QrCode = null;
let isScanning = false;

const DASHBOARD_URL = "https://dashboard-inky-iota-87.vercel.app";

// DOM要素
const elements = {
  statusBadge: document.getElementById("statusBadge"),
  scannerSection: document.getElementById("scannerSection"),
  qrReader: document.getElementById("qr-reader"),
  startScanButton: document.getElementById("startScanButton"),
  stopScanButton: document.getElementById("stopScanButton"),
  manualInput: document.getElementById("manualInput"),
  sessionIdInput: document.getElementById("sessionIdInput"),
  studentIdInput: document.getElementById("studentIdInput"),
  connectManualButton: document.getElementById("connectManualButton"),
  toggleManualButton: document.getElementById("toggleManualButton"),
  sessionInfo: document.getElementById("sessionInfo"),
  displaySessionId: document.getElementById("displaySessionId"),
  displayStudentId: document.getElementById("displayStudentId"),
  captureCountEl: document.getElementById("captureCount"),
  cameraPreview: document.getElementById("cameraPreview"),
  cameraVideo: document.getElementById("cameraVideo"),
  cameraCanvas: document.getElementById("cameraCanvas"),
  captureIndicator: document.getElementById("captureIndicator"),
  testCaptureButton: document.getElementById("testCaptureButton"),
  disconnectButton: document.getElementById("disconnectButton"),
  captureHistory: document.getElementById("captureHistory"),
  captureList: document.getElementById("captureList"),
  captureFlash: document.getElementById("captureFlash"),
  toast: document.getElementById("toast"),
};

// ============================================
// 初期化
// ============================================

window.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 ClassGuard Smartphone App Started");

  // 保存されたセッション情報を復元
  await restoreSession();

  // イベントリスナー設定
  setupEventListeners();

  console.log("✅ 初期化完了");
});

// ============================================
// イベントリスナー
// ============================================

function setupEventListeners() {
  // QRスキャン開始/停止
  elements.startScanButton.addEventListener("click", startQRScan);
  elements.stopScanButton.addEventListener("click", stopQRScan);

  // 手動入力切り替え
  elements.toggleManualButton.addEventListener("click", toggleManualInput);

  // 手動接続
  elements.connectManualButton.addEventListener("click", connectManually);

  // テスト撮影
  elements.testCaptureButton.addEventListener("click", () => {
    console.log("🧪 テスト撮影ボタンクリック");
    capturePhoto();
  });

  // 切断
  elements.disconnectButton.addEventListener("click", disconnect);
}

// ============================================
// QRコードスキャン
// ============================================

async function startQRScan() {
  try {
    showToast("📷 QRコードスキャンを開始...");

    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode("qr-reader");
    }

    elements.qrReader.style.display = "block";
    elements.startScanButton.style.display = "none";
    elements.stopScanButton.style.display = "block";
    isScanning = true;

    await html5QrCode.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
      },
      onScanSuccess,
      onScanError
    );

    console.log("✅ QR scanner started");
  } catch (error) {
    console.error("❌ QR scan error:", error);
    showToast("カメラの起動に失敗しました");
    elements.startScanButton.style.display = "block";
    elements.stopScanButton.style.display = "none";
  }
}

async function stopQRScan() {
  if (html5QrCode && isScanning) {
    try {
      await html5QrCode.stop();
      elements.qrReader.style.display = "none";
      elements.startScanButton.style.display = "block";
      elements.stopScanButton.style.display = "none";
      isScanning = false;
      console.log("⏹️ QR scanner stopped");
    } catch (error) {
      console.error("❌ Stop scanner error:", error);
    }
  }
}

function onScanSuccess(decodedText, decodedResult) {
  console.log("📸 QRコード検出:", decodedText);

  // URLからセッションIDと学生IDを抽出
  try {
    const url = new URL(decodedText);
    const scannedSessionId = url.searchParams.get("session");
    const scannedStudentId = url.searchParams.get("studentId");

    if (scannedSessionId && scannedStudentId) {
      // スキャン停止
      stopQRScan();

      // 接続
      connectToSession(scannedSessionId, scannedStudentId);
    } else {
      showToast("❌ 無効なQRコードです");
    }
  } catch (error) {
    console.error("❌ QR parse error:", error);
    showToast("❌ QRコードの解析に失敗しました");
  }
}

function onScanError(errorMessage) {
  // スキャンエラーは無視（頻繁に発生するため）
}

// ============================================
// 手動入力
// ============================================

function toggleManualInput() {
  const isManualVisible = elements.manualInput.classList.contains("show");

  if (isManualVisible) {
    elements.manualInput.classList.remove("show");
    elements.scannerSection.style.display = "block";
    elements.toggleManualButton.textContent = "✏️ 手動入力に切り替え";
  } else {
    elements.manualInput.classList.add("show");
    elements.scannerSection.style.display = "none";
    elements.toggleManualButton.textContent = "📷 QRスキャンに切り替え";
  }
}

function connectManually() {
  const manualSessionId = elements.sessionIdInput.value.trim();
  const manualStudentId = elements.studentIdInput.value.trim();

  if (!manualSessionId || !manualStudentId) {
    showToast("セッションIDと学生IDを入力してください");
    return;
  }

  connectToSession(manualSessionId, manualStudentId);
}

// ============================================
// セッション接続
// ============================================

async function connectToSession(sid, stid) {
  sessionId = sid;
  studentId = stid;

  console.log("🔌 接続中...", { sessionId, studentId });

  updateStatus("connecting", "🟡 接続中...");
  showToast("🔌 サーバーに接続中...");

  try {
    // Pusher設定を取得
    const response = await fetch(`${DASHBOARD_URL}/api/pusher-config`);
    const config = await response.json();

    console.log("🔑 Pusher config:", config);

    // Pusher接続
    pusher = new Pusher(config.key, {
      cluster: config.cluster,
    });

    const channelName = `session-${sessionId}`;
    console.log("📡 Subscribing to channel:", channelName);
    channel = pusher.subscribe(channelName);

    channel.bind("pusher:subscription_succeeded", () => {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("✅ Pusher接続成功");
      console.log("   Channel:", channelName);
      console.log("   Session ID:", sessionId);
      console.log("   Student ID:", studentId);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      updateStatus("connected", "🟢 接続済み");
      showToast("✅ 接続しました");

      // UI更新
      elements.scannerSection.style.display = "none";
      elements.manualInput.classList.remove("show");
      elements.toggleManualButton.style.display = "none";
      elements.sessionInfo.classList.add("show");
      elements.disconnectButton.style.display = "block";
      elements.captureHistory.classList.add("show");

      elements.displaySessionId.textContent = sessionId;
      elements.displayStudentId.textContent = studentId;

      // セッション情報を保存
      saveSession();

      // カメラ起動
      startCamera();
    });

    channel.bind("pusher:subscription_error", (error) => {
      console.error("❌ Pusher接続エラー:", error);
      updateStatus("disconnected", "🔴 接続失敗");
      showToast("❌ 接続に失敗しました");
    });

    // 撮影トリガーを受信
    channel.bind("trigger-capture", async (data) => {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📸 撮影トリガー受信!");
      console.log("   Data:", data);
      console.log("   Expected studentId:", studentId);
      console.log("   Received studentId:", data.studentId);
      console.log("   Match:", data.studentId === studentId);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      if (data.studentId === studentId) {
        console.log("✅ Student ID一致 - 撮影開始");
        await capturePhoto();
      } else {
        console.log("⚠️ Student ID不一致 - 撮影スキップ");
      }
    });
  } catch (error) {
    console.error("❌ 接続エラー:", error);
    updateStatus("disconnected", "🔴 接続エラー");
    showToast("❌ 接続エラー: " + error.message);
  }
}

// ============================================
// カメラ起動
// ============================================

async function startCamera() {
  try {
    console.log("📷 カメラ起動中...");
    updateStatus("ready", "📷 撮影準備完了");

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment", // 外カメラ
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    elements.cameraVideo.srcObject = cameraStream;
    elements.cameraPreview.classList.add("show");
    elements.captureIndicator.classList.add("show");
    elements.testCaptureButton.style.display = "block"; // テスト撮影ボタンを表示

    console.log("✅ カメラ起動完了");
    showToast("📷 カメラ起動完了");
  } catch (error) {
    console.error("❌ カメラエラー:", error);
    showToast("❌ カメラの起動に失敗しました");
  }
}

// ============================================
// 写真撮影
// ============================================

async function capturePhoto() {
  try {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📸 写真を撮影中...");
    console.log("   Camera stream:", cameraStream);
    console.log("   Video element:", elements.cameraVideo);
    console.log("   Video ready:", elements.cameraVideo.readyState);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    if (!cameraStream) {
      console.error("❌ カメラが起動していません");
      showToast("❌ カメラが起動していません");
      return;
    }

    // フラッシュエフェクト
    elements.captureFlash.classList.add("active");
    setTimeout(() => {
      elements.captureFlash.classList.remove("active");
    }, 500);

    // Canvas に描画
    const video = elements.cameraVideo;
    const canvas = elements.cameraCanvas;
    const context = canvas.getContext("2d");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    console.log("📐 Canvas size:", canvas.width, "x", canvas.height);

    // 画像をBlobに変換
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.95)
    );

    console.log("📦 Blob size:", blob.size, "bytes");

    // Base64に変換
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      const base64Image = reader.result;

      console.log("✅ 撮影完了 - Base64 length:", base64Image.length);

      // 撮影回数を更新
      captureCount++;
      elements.captureCountEl.textContent = captureCount;

      // 撮影履歴に追加
      addCaptureToHistory(base64Image);

      // サーバーに送信
      await sendCaptureToServer(base64Image);

      showToast("📸 撮影しました");
    };
  } catch (error) {
    console.error("❌ 撮影エラー:", error);
    showToast("❌ 撮影に失敗しました");
  }
}

// ============================================
// 撮影データをサーバーに送信
// ============================================

async function sendCaptureToServer(base64Image) {
  try {
    console.log("💾 撮影データをローカルに保存（サーバー送信なし）");

    // ローカルストレージに保存（オプション）
    const captures = JSON.parse(localStorage.getItem("captures") || "[]");
    captures.unshift({
      image: base64Image,
      timestamp: Date.now(),
      sessionId: sessionId,
      studentId: studentId,
    });

    // 最大10件まで保存
    if (captures.length > 10) {
      captures.pop();
    }

    localStorage.setItem("captures", JSON.stringify(captures));

    console.log("✅ ローカルストレージに保存しました");

    // サーバーに送信しない（コメントアウト）
    /*
    const response = await fetch(`${DASHBOARD_URL}/api/smartphone-capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: sessionId,
        studentId: studentId,
        image: base64Image,
        timestamp: Date.now(),
      }),
    });

    if (response.ok) {
      console.log("✅ 撮影データを送信しました");
    } else {
      console.error("❌ 送信失敗:", response.status);
    }
    */
  } catch (error) {
    console.error("❌ 保存エラー:", error);
  }
}

// ============================================
// 撮影履歴に追加
// ============================================

function addCaptureToHistory(base64Image) {
  const captureItem = document.createElement("div");
  captureItem.className = "capture-item";

  const img = document.createElement("img");
  img.src = base64Image;

  const info = document.createElement("div");
  info.className = "capture-item-info";

  const time = document.createElement("div");
  time.className = "capture-item-time";
  time.textContent = new Date().toLocaleString("ja-JP");

  const status = document.createElement("div");
  status.className = "capture-item-status";
  status.textContent = "✅ 送信完了";

  info.appendChild(time);
  info.appendChild(status);

  captureItem.appendChild(img);
  captureItem.appendChild(info);

  elements.captureList.insertBefore(
    captureItem,
    elements.captureList.firstChild
  );

  // 最大5件まで保持
  while (elements.captureList.children.length > 5) {
    elements.captureList.removeChild(elements.captureList.lastChild);
  }
}

// ============================================
// セッション保存/復元
// ============================================

function saveSession() {
  localStorage.setItem("sessionId", sessionId);
  localStorage.setItem("studentId", studentId);
  console.log("💾 セッション保存:", { sessionId, studentId });
}

async function restoreSession() {
  const savedSessionId = localStorage.getItem("sessionId");
  const savedStudentId = localStorage.getItem("studentId");

  if (savedSessionId && savedStudentId) {
    console.log("📂 前回のセッションを復元:", {
      savedSessionId,
      savedStudentId,
    });
    showToast("前回のセッションに再接続中...");
    await connectToSession(savedSessionId, savedStudentId);
  }
}

// ============================================
// 切断
// ============================================

function disconnect() {
  if (pusher) {
    pusher.disconnect();
  }

  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }

  localStorage.removeItem("sessionId");
  localStorage.removeItem("studentId");

  sessionId = null;
  studentId = null;
  captureCount = 0;

  // UI リセット
  updateStatus("disconnected", "⚪ 未接続");
  elements.scannerSection.style.display = "block";
  elements.toggleManualButton.style.display = "block";
  elements.sessionInfo.classList.remove("show");
  elements.cameraPreview.classList.remove("show");
  elements.testCaptureButton.style.display = "none"; // テスト撮影ボタンを非表示
  elements.disconnectButton.style.display = "none";
  elements.captureHistory.classList.remove("show");
  elements.captureList.innerHTML = "";
  elements.captureCountEl.textContent = "0";

  showToast("🔌 切断しました");
  console.log("🔌 切断完了");
}

// ============================================
// ステータス更新
// ============================================

function updateStatus(status, text) {
  elements.statusBadge.className = `status-badge ${status}`;
  elements.statusBadge.textContent = text;
}

// ============================================
// トースト通知
// ============================================

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");

  setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 3000);
}

console.log("✅ Smartphone app script loaded");
