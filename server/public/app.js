// ClassGuard PWA - メインアプリケーション

// グローバル変数
let socket = null;
let cameraStream = null;
let html5QrCode = null;
let pairingInfo = null;
let wakeLock = null;

// 初期化
document.addEventListener("DOMContentLoaded", async () => {
  console.log("📱 ClassGuard PWA起動");

  // Service Worker登録
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("sw.js");
      console.log("✅ Service Worker登録成功");
    } catch (err) {
      console.error("❌ Service Worker登録失敗:", err);
    }
  }

  loadPairingInfo();
  setupEventListeners();
  requestNotificationPermission();
  loadGallery();
});

// デバッグ: ペアリング情報をクリア
function clearPairingInfo() {
  if (confirm("ペアリング情報を削除しますか？")) {
    localStorage.removeItem("pairingInfo");
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    updateConnectionStatus(false);
    document.getElementById("anonymous-id").textContent = "未設定";
    document.getElementById("server-url").textContent = "未設定";
    showToast("✅ ペアリング情報を削除しました");

    // ページをリロード
    setTimeout(() => {
      location.reload();
    }, 1000);
  }
}

// イベントリスナー設定
function setupEventListeners() {
  document.getElementById("scan-qr-btn").addEventListener("click", startQRScan);
  document.getElementById("close-qr-btn").addEventListener("click", stopQRScan);
  document
    .getElementById("manual-capture-btn")
    .addEventListener("click", manualCapture);
  document
    .getElementById("view-gallery-btn")
    .addEventListener("click", showGallery);
  document
    .getElementById("close-gallery-btn")
    .addEventListener("click", closeGallery);
  document
    .getElementById("delete-all-btn")
    .addEventListener("click", deleteAllPhotos);
  document
    .getElementById("test-connection-btn")
    .addEventListener("click", testConnection);
  document
    .getElementById("clear-pairing-btn")
    .addEventListener("click", clearPairingInfo);
  // デバッグ用: ダブルタップでもクリア可能
  document
    .getElementById("status-text")
    .addEventListener("dblclick", clearPairingInfo);
}

// ペアリング情報の読み込み
function loadPairingInfo() {
  const saved = localStorage.getItem("pairingInfo");
  if (saved) {
    try {
      pairingInfo = JSON.parse(saved);
      console.log("📋 保存されたペアリング情報を読み込み:", pairingInfo);

      // サーバーURLの検証（ngrok-free.appは古いURLなので削除）
      if (
        pairingInfo.serverUrl &&
        pairingInfo.serverUrl.includes("ngrok-free.app")
      ) {
        console.warn("⚠️ 古いサーバーURLを検出、クリアします");
        localStorage.removeItem("pairingInfo");
        pairingInfo = null;
        showToast(
          "古い接続情報を削除しました。QRコードを再スキャンしてください。"
        );
        return;
      }

      // UI更新
      updateConnectionStatus(false); // まず未接続状態で表示
      document.getElementById("anonymous-id").textContent =
        pairingInfo.anonymousId || "未設定";
      document.getElementById("server-url").textContent =
        pairingInfo.serverUrl || "未設定";

      // サーバーに接続
      connectToServer(pairingInfo);
    } catch (err) {
      console.error("❌ ペアリング情報の読み込みエラー:", err);
      // エラー時はクリア
      localStorage.removeItem("pairingInfo");
      pairingInfo = null;
    }
  } else {
    console.log("ℹ️ 保存されたペアリング情報がありません");
  }
}

// ペアリング情報の保存
function savePairingInfo(info) {
  pairingInfo = info;
  localStorage.setItem("pairingInfo", JSON.stringify(info));
  console.log("💾 ペアリング情報を保存:", info);
}

// QRスキャン開始
async function startQRScan() {
  console.log("📷 QRスキャン開始");
  switchScreen("qr-scan-screen");

  try {
    html5QrCode = new Html5Qrcode("qr-reader");
    await html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      onQRCodeScanned,
      (errorMessage) => {
        // QRコード検出エラーは無視（連続スキャン中は正常）
      }
    );
    console.log("✅ QRスキャン起動成功");
  } catch (err) {
    console.error("❌ QRスキャン起動失敗:", err);
    showToast("カメラの起動に失敗しました");
    switchScreen("main-screen");
  }
}

// QRコードスキャン成功時
function onQRCodeScanned(decodedText) {
  console.log("🔍 QRコード検出:", decodedText);

  try {
    const info = JSON.parse(decodedText);
    console.log("📋 パース成功:", info);

    // 必須フィールドの確認
    if (!info.serverUrl || !info.anonymousId) {
      console.warn("⚠️ 無効なQRコード（必須フィールドなし）:", info);
      showToast("無効なQRコードです");
      return;
    }

    console.log("✅ 有効なペアリング情報を検出");

    // QRスキャン停止
    stopQRScan();

    // ペアリング情報を保存
    savePairingInfo(info);

    // UIを即座に更新
    document.getElementById("status-dot").className = "status-dot connecting";
    document.getElementById("status-text").textContent = "接続中...";
    document.getElementById("anonymous-id").textContent = info.anonymousId;
    document.getElementById("server-url").textContent = info.serverUrl;
    document.getElementById("test-connection-btn").style.display = "block";

    // サーバーに接続
    connectToServer(info);

    // 成功メッセージ
    showToast("✅ ペアリング成功！サーバーに接続中...");
  } catch (err) {
    console.error("❌ QRコード解析エラー:", err);
    showToast("QRコードの形式が正しくありません");
  }
}

// QRスキャン停止
async function stopQRScan() {
  if (html5QrCode) {
    try {
      await html5QrCode.stop();
      html5QrCode.clear();
      html5QrCode = null;
      console.log("⏹️ QRスキャン停止");
    } catch (err) {
      console.error("❌ QRスキャン停止エラー:", err);
    }
  }
  switchScreen("main-screen");
}

// サーバー接続
function connectToServer(info) {
  if (!info || !info.serverUrl) {
    console.error("❌ 接続情報が不正です:", info);
    showToast("接続情報が不正です");
    return;
  }

  // URLの正規化（末尾のスラッシュを削除）
  const serverUrl = info.serverUrl.replace(/\/$/, "");

  console.log("🌐 サーバーに接続中:", info.serverUrl);
  console.log("📋 匿名ID:", info.anonymousId);

  // 既存の接続があれば切断
  if (socket) {
    console.log("🔌 既存の接続を切断");
    socket.disconnect();
    socket = null;
  }

  try {
    // Socket.io接続
    socket = io(serverUrl, {
      path: "/socket.io/",
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 5,
      timeout: 10000,
      autoConnect: true,
      forceNew: true, // 新しい接続を強制
      // CORS対応
      withCredentials: false,
      extraHeaders: {
        "ngrok-skip-browser-warning": "true",
      },
    });

    // 接続成功
    socket.on("connect", () => {
      console.log("✅ サーバーに接続成功");
      console.log("📡 Socket ID:", socket.id);
      console.log("📡 Transport:", socket.io.engine.transport.name);
      updateConnectionStatus(true);

      // スマホとして参加
      socket.emit("smartphone-join", {
        anonymousId: info.anonymousId,
        deviceType: "smartphone",
      });

      showToast("✅ サーバーに接続しました");
    });

    // 参加成功
    socket.on("joined", (data) => {
      console.log("✅ 参加成功:", data);

      // カメラ起動
      startCamera();

      // Wake Lock
      requestWakeLock();
    });

    showToast("✅ サーバーに接続しました");

    // 切断
    socket.on("disconnect", (reason) => {
      console.log("❌ サーバーから切断:", reason);
      updateConnectionStatus(false);
      showToast("サーバーから切断されました");
    });

    // 再接続成功
    socket.on("reconnect", (attemptNumber) => {
      console.log("🔄 サーバーに再接続成功:", attemptNumber);
      updateConnectionStatus(true);
      showToast("再接続しました");

      // 再参加
      socket.emit("smartphone-join", {
        anonymousId: info.anonymousId,
        deviceType: "smartphone",
      });
    });

    // 接続エラー
    socket.on("connect_error", (error) => {
      console.error("❌ 接続エラー:", error.message);
      updateConnectionStatus(false);
      showToast("サーバーに接続できません");
    });

    // 撮影指令
    socket.on("capture", async () => {
      console.log("📸 撮影指令を受信");
      await autoCapture();
    });

    // エラー
    socket.on("error", (error) => {
      console.error("❌ Socket.ioエラー:", error);
    });
  } catch (err) {
    console.error("❌ Socket.io初期化エラー:", err);
    updateConnectionStatus(false);
    showToast("接続の初期化に失敗しました");
  }
}

// 接続ステータス更新
function updateConnectionStatus(isConnected) {
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const clearBtn = document.getElementById("clear-pairing-btn");

  if (isConnected) {
    statusDot.className = "status-dot connected";
    statusText.textContent = "接続中";

    if (pairingInfo) {
      document.getElementById("server-url").textContent = pairingInfo.serverUrl;
      document.getElementById("anonymous-id").textContent =
        pairingInfo.anonymousId;
    }

    document.getElementById("test-connection-btn").style.display = "block";
    if (clearBtn) clearBtn.style.display = "block";
  } else {
    statusDot.className = "status-dot disconnected";
    statusText.textContent = "未接続";

    // ペアリング情報が保存されている場合のみクリアボタンを表示
    if (pairingInfo && clearBtn) {
      clearBtn.style.display = "block";
    }
  }
}

// 接続テスト
function testConnection() {
  if (socket && socket.connected) {
    showToast("✅ 接続は正常です");
    console.log("✅ 接続状態: 正常");
    console.log("📡 Socket ID:", socket.id);
    console.log("📡 Transport:", socket.io.engine.transport.name);
  } else {
    showToast("❌ 接続が切れています");
    console.log("❌ 接続状態: 切断");

    // 再接続を試行
    if (pairingInfo) {
      showToast("再接続を試行中...");
      connectToServer(pairingInfo);
    }
  }
}

// カメラ起動
async function startCamera() {
  console.log("📷 カメラ起動");

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });

    const preview = document.getElementById("camera-preview");
    preview.srcObject = cameraStream;

    // メタデータ読み込み待機
    await new Promise((resolve) => {
      preview.onloadedmetadata = resolve;
    });

    await preview.play();

    document.getElementById("camera-container").classList.add("active");
    console.log("✅ カメラ起動成功");
    showToast("📷 カメラ準備完了");
  } catch (err) {
    console.error("❌ カメラ起動失敗:", err);
    showToast("カメラの起動に失敗しました");
  }
}

// 自動撮影
async function autoCapture() {
  console.log("📸 自動撮影開始");
  const success = await capturePhoto("auto");

  if (success) {
    // サーバーに完了通知
    if (socket && socket.connected) {
      socket.emit("capture-complete", {
        success: true,
        timestamp: Date.now(),
      });
    }

    showNotification("授業スライドを撮影しました");
    showToast("📸 自動撮影しました");
  } else {
    showToast("❌ 撮影に失敗しました");
  }
}

// 手動撮影
async function manualCapture() {
  console.log("📸 手動撮影開始");
  const success = await capturePhoto("manual");
  if (success) {
    showToast("📸 撮影しました");
  } else {
    showToast("❌ 撮影に失敗しました");
  }
}

// 撮影実行
async function capturePhoto(type) {
  try {
    if (!cameraStream) {
      console.warn("⚠️ カメラが起動していません");
      await startCamera();

      // カメラ起動待機
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (!cameraStream) {
        console.error("❌ カメラ起動失敗");
        return false;
      }
    }

    const video = document.getElementById("camera-preview");

    // ビデオが再生中か確認
    if (video.paused || video.ended) {
      console.warn("⚠️ ビデオが停止しています");
      return false;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    const imageData = canvas.toDataURL("image/jpeg", 0.9);
    await savePhoto(imageData, type);
    updateLastCaptureTime();

    console.log("✅ 撮影成功");
    return true;
  } catch (err) {
    console.error("❌ 撮影エラー:", err);
    return false;
  }
}

// 写真保存
async function savePhoto(imageData, type) {
  try {
    const photos = getPhotosFromStorage();
    const photo = {
      id: Date.now(),
      data: imageData,
      type: type,
      timestamp: new Date().toISOString(),
    };

    photos.push(photo);
    localStorage.setItem("photos", JSON.stringify(photos));

    // 自動ダウンロード
    downloadImage(imageData, `slide_${photo.id}.jpg`);

    console.log("✅ 写真保存成功");
  } catch (err) {
    console.error("❌ 保存エラー:", err);
    if (err.name === "QuotaExceededError") {
      showToast("❌ ストレージが満杯です");
    }
  }
}

// 画像ダウンロード
function downloadImage(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// 最終撮影時刻更新
function updateLastCaptureTime() {
  document.getElementById("last-capture").textContent =
    new Date().toLocaleTimeString("ja-JP");
}

// ギャラリー表示
function showGallery() {
  switchScreen("gallery-screen");
  loadGallery();
}

// ギャラリー閉じる
function closeGallery() {
  switchScreen("main-screen");
}

// ギャラリー読み込み
function loadGallery() {
  const photos = getPhotosFromStorage();
  const grid = document.getElementById("gallery-grid");
  const empty = document.getElementById("gallery-empty");

  grid.innerHTML = "";

  if (photos.length === 0) {
    empty.style.display = "block";
    document.getElementById("delete-all-btn").style.display = "none";
    return;
  }

  empty.style.display = "none";
  document.getElementById("delete-all-btn").style.display = "block";

  photos.reverse().forEach((photo) => {
    const item = document.createElement("div");
    item.className = "gallery-item";
    const img = document.createElement("img");
    img.src = photo.data;
    img.alt = `撮影: ${new Date(photo.timestamp).toLocaleString("ja-JP")}`;
    item.appendChild(img);
    grid.appendChild(item);
  });
}

// LocalStorageから写真取得
function getPhotosFromStorage() {
  try {
    const photos = localStorage.getItem("photos");
    return photos ? JSON.parse(photos) : [];
  } catch (err) {
    console.error("❌ 写真取得エラー:", err);
    return [];
  }
}

// 全写真削除
function deleteAllPhotos() {
  if (confirm("すべての写真を削除しますか？")) {
    localStorage.removeItem("photos");
    loadGallery();
    showToast("✅ すべての写真を削除しました");
  }
}

// 通知権限リクエスト
async function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    console.log("通知権限:", permission);
  }
}

// 通知表示
function showNotification(body, title = "ClassGuard") {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, {
      body: body,
      vibrate: [200, 100, 200],
      icon: "icon-192.png",
    });
  }
}

// 画面切り替え
function switchScreen(screenId) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  document.getElementById(screenId).classList.add("active");
}

// トースト表示
function showToast(message, duration = 3000) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), duration);
}

// Wake Lock
async function requestWakeLock() {
  if ("wakeLock" in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      console.log("✅ Wake Lock有効");
    } catch (err) {
      console.error("❌ Wake Lockエラー:", err);
    }
  }
}

// ページ離脱時
window.addEventListener("beforeunload", () => {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
  }
  if (socket) socket.disconnect();
  if (wakeLock) wakeLock.release();
});
