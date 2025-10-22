// ClassGuard PWA - メインアプリケーション

// グローバル変数
let socket = null;
let cameraStream = null;
let html5QrCode = null;
let pairingInfo = null;
let wakeLock = null;

// 初期化
document.addEventListener("DOMContentLoaded", async () => {
  console.log("ClassGuard PWA起動");

  // Service Worker登録
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("sw.js");
      console.log("Service Worker登録成功");
    } catch (err) {
      console.error("Service Worker登録失敗:", err);
    }
  }

  loadPairingInfo();
  setupEventListeners();
  requestNotificationPermission();
  loadGallery();
});

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
}

// ペアリング情報の読み込み
function loadPairingInfo() {
  const saved = localStorage.getItem("pairingInfo");
  if (saved) {
    try {
      pairingInfo = JSON.parse(saved);
      console.log("保存されたペアリング情報を読み込み");
      connectToServer(pairingInfo);
    } catch (err) {
      console.error("ペアリング情報の読み込みエラー:", err);
    }
  }
}

// ペアリング情報の保存
function savePairingInfo(info) {
  pairingInfo = info;
  localStorage.setItem("pairingInfo", JSON.stringify(info));
  console.log("ペアリング情報を保存");
}

// QRスキャン開始
async function startQRScan() {
  console.log("QRスキャン開始");
  switchScreen("qr-scan-screen");

  try {
    html5QrCode = new Html5Qrcode("qr-reader");
    await html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      onQRCodeScanned,
      () => {} // エラーは無視
    );
  } catch (err) {
    console.error("QRスキャン起動失敗:", err);
    showToast("カメラの起動に失敗しました");
    switchScreen("main-screen");
  }
}

function onQRCodeScanned(decodedText) {
  console.log("QRコード検出:", decodedText);

  try {
    const info = JSON.parse(decodedText);
    console.log("パース成功:", info);

    if (info.serverUrl && info.anonymousId) {
      console.log("有効なペアリング情報");

      // QRスキャン停止
      stopQRScan();

      // ペアリング情報を保存
      pairingInfo = info;
      localStorage.setItem("pairingInfo", JSON.stringify(info));
      console.log("保存完了");

      // 画面を即座に更新（重要！）
      document.getElementById("status-dot").className = "status-dot connected";
      document.getElementById("status-text").textContent = "接続中";
      document.getElementById("anonymous-id").textContent = info.anonymousId;
      document.getElementById("server-url").textContent = info.serverUrl;
      document.getElementById("test-connection-btn").style.display = "block";

      // カメラコンテナを表示
      document.getElementById("camera-container").classList.add("active");

      // カメラを起動
      startCamera();

      // サーバーに接続（バックグラウンド）
      connectToServer(info);

      // 成功メッセージ
      showToast("ペアリング成功！カメラ起動中...");
    } else {
      console.log("無効な情報:", info);
      showToast("無効なQRコードです");
    }
  } catch (err) {
    console.error("QRコード解析エラー:", err);
    showToast("QRコードの形式が正しくありません");
  }
}

// QRスキャン停止
async function stopQRScan() {
  if (html5QrCode) {
    try {
      await html5QrCode.stop();
      html5QrCode = null;
    } catch (err) {
      console.error("QRスキャン停止エラー:", err);
    }
  }
  switchScreen("main-screen");
}

// 1. ペアリング情報を手動で設定
const testInfo = {
  serverUrl: "wss://epicedian-torrie-subturriculated.ngrok-free.app",
  anonymousId: "anon_test_" + Date.now(),
  sessionId: "cls_test_" + Date.now(),
};

// 2. 保存
savePairingInfo(testInfo);

// 3. 接続
connectToServer(testInfo);

// 4. 確認
console.log("ペアリング情報:", localStorage.getItem("pairingInfo"));

// サーバー接続
function connectToServer(info) {
  console.log("サーバーに接続中:", info.serverUrl);

  if (socket) socket.disconnect();

  socket = io(info.serverUrl + "/smartphone", {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });

  socket.on("connect", () => {
    console.log("サーバーに接続成功");
    updateConnectionStatus(true);
    socket.emit("join", info.anonymousId);
    startCamera();
    requestWakeLock();
  });

  socket.on("disconnect", () => {
    console.log("サーバーから切断");
    updateConnectionStatus(false);
  });

  socket.on("reconnect", () => {
    console.log("サーバーに再接続");
    updateConnectionStatus(true);
    showToast("再接続しました");
  });

  socket.on("capture", async () => {
    console.log("撮影指令を受信");
    await autoCapture();
  });
}

// 接続ステータス更新
function updateConnectionStatus(isConnected) {
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");

  if (isConnected) {
    statusDot.className = "status-dot connected";
    statusText.textContent = "接続中";
    document.getElementById("server-url").textContent = pairingInfo.serverUrl;
    document.getElementById("anonymous-id").textContent =
      pairingInfo.anonymousId;
    document.getElementById("test-connection-btn").style.display = "block";
  } else {
    statusDot.className = "status-dot disconnected";
    statusText.textContent = "未接続";
  }
}

// 接続テスト
function testConnection() {
  if (socket && socket.connected) {
    showToast("接続は正常です ✓");
  } else {
    showToast("接続が切れています ✗");
  }
}

// カメラ起動
async function startCamera() {
  console.log("カメラ起動");

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });

    document.getElementById("camera-preview").srcObject = cameraStream;
    document.getElementById("camera-container").classList.add("active");
    showToast("カメラ準備完了 📷");
  } catch (err) {
    console.error("カメラ起動失敗:", err);
    showToast("カメラの起動に失敗しました");
  }
}

// 自動撮影
async function autoCapture() {
  console.log("自動撮影");
  const success = await capturePhoto("auto");

  if (success) {
    if (socket && socket.connected) {
      socket.emit("capture-complete", { success: true });
    }
    showNotification("授業スライドを撮影しました");
    showToast("📸 自動撮影しました");
  }
}

// 手動撮影
async function manualCapture() {
  console.log("手動撮影");
  const success = await capturePhoto("manual");
  if (success) showToast("📸 撮影しました");
}

// 撮影実行
async function capturePhoto(type) {
  try {
    if (!cameraStream) return false;

    const video = document.getElementById("camera-preview");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    const imageData = canvas.toDataURL("image/jpeg", 0.9);
    await savePhoto(imageData, type);
    updateLastCaptureTime();

    return true;
  } catch (err) {
    console.error("撮影エラー:", err);
    return false;
  }
}

// 写真保存
async function savePhoto(imageData, type) {
  try {
    const photos = getPhotosFromStorage();
    photos.push({
      id: Date.now(),
      data: imageData,
      type: type,
      timestamp: new Date().toISOString(),
    });
    localStorage.setItem("photos", JSON.stringify(photos));
    downloadImage(imageData, `slide_${Date.now()}.jpg`);
  } catch (err) {
    console.error("保存エラー:", err);
    if (err.name === "QuotaExceededError") {
      showToast("ストレージが満杯です");
    }
  }
}

// 画像ダウンロード
function downloadImage(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
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
    return;
  }

  empty.style.display = "none";
  photos.reverse().forEach((photo) => {
    const item = document.createElement("div");
    item.className = "gallery-item";
    const img = document.createElement("img");
    img.src = photo.data;
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
    return [];
  }
}

// 全写真削除
function deleteAllPhotos() {
  if (confirm("すべての写真を削除しますか？")) {
    localStorage.removeItem("photos");
    loadGallery();
    showToast("すべての写真を削除しました");
  }
}

// 通知権限リクエスト
async function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    await Notification.requestPermission();
  }
}

// 通知表示
function showNotification(body, title = "ClassGuard") {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body: body, vibrate: [200, 100, 200] });
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
      console.log("Wake Lock有効");
    } catch (err) {
      console.error("Wake Lockエラー:", err);
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
