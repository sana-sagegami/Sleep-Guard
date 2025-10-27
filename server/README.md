# SleepGuard 修正版 - インストール手順

## 🎯 修正内容

### ✅ 修正したエラー

1. **`document is not defined`** → WebSocket に変更（Socket.io 不要）
2. **`Could not establish connection`** → エラーハンドリング追加
3. **Service Worker 非対応コード** → 完全対応

### 🔧 主な変更点

#### background.js

- ❌ Socket.io（CDN から読み込み）
- ✅ WebSocket（ネイティブ実装）
- ✅ すべてのメッセージ送信に`.catch()`追加
- ✅ 自動再接続機能（5 秒間隔）
- ✅ Service Worker 完全対応

#### manifest.json

- ✅ CSP ポリシー追加
- ✅ アイコン設定追加

---

## 📦 インストール方法

### 1. ファイルを配置

```
SleepGuard/
├── manifest.json       ← 新しいファイル
├── background.js       ← 新しいファイル
├── content.js          ← 既存のまま
├── popup.html          ← 既存のまま
├── alert.html          ← 既存のまま
└── icons/              ← アイコンフォルダ
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### 2. Chrome 拡張機能を再読み込み

1. `chrome://extensions/` を開く
2. SleepGuard の「🔄 再読み込み」をクリック

### 3. 動作確認

1. 拡張機能アイコンをクリック
2. サーバー URL 入力（例: `wss://your-server.com`）
3. 「保存」をクリック
4. コンソールで以下を確認：
   ```
   ✅ SleepGuard拡張機能がインストールされました
   ✅ 設定を読み込み: Object
   ✅ サーバーに接続中: wss://...
   ✅ サーバーに接続成功
   ✅ 居眠り検知を開始
   ```

---

## 🐛 トラブルシューティング

### エラーが出る場合

1. **F12 キー** → 「Service Worker」タブを開く
2. エラーメッセージを確認
3. 「🔄 再読み込み」をクリック

### 接続できない場合

- サーバー URL が正しいか確認（`wss://` または `ws://`）
- サーバーが起動しているか確認
- ファイアウォール設定を確認

---

## 📝 サーバー側の対応

WebSocket を使用しているため、サーバー側も対応が必要です：

```javascript
// Node.js + ws の例
const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 8080 });

wss.on("connection", (ws) => {
  console.log("クライアント接続");

  ws.on("message", (message) => {
    const data = JSON.parse(message);
    console.log("受信:", data);

    if (data.type === "join") {
      // セッション参加処理
    } else if (data.type === "status") {
      // ステータス更新処理
    }
  });
});
```

---

## 💡 Socket.io を使いたい場合

`SOCKET_IO_GUIDE.md` を参照してください。

ただし、**WebSocket で十分動作**するため、特別な理由がない限り
現在の実装をそのまま使用することを推奨します。

---

## ✅ チェックリスト

- [ ] `background.js` を新しいファイルに置き換え
- [ ] `manifest.json` を新しいファイルに置き換え
- [ ] アイコンファイルを配置（なければダミーで OK）
- [ ] Chrome 拡張機能を再読み込み
- [ ] サーバー URL を設定
- [ ] 接続成功を確認

**すべて完了したら、顔検出テストを開始できます！**
