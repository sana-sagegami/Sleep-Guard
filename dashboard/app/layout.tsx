export const metadata = {
  title: "ClassGuard - リアルタイム居眠り検知",
  description: "生徒の居眠りをリアルタイムで監視",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
