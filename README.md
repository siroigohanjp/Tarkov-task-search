# Tarkov タスク検索（静的ブラウザアプリ）

このリポジトリはブラウザだけで動作する静的なアプリです。スクショを読み込み、赤枠のタスク名をOCRして攻略サイトを検索します。

公開手順（GitHub Pages）

1. 新しい GitHub リポジトリを作成する（例: `tarkov-task-search`）。
2. ローカルでリモートを追加してコミット・プッシュする:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin git@github.com:YOUR_USER/YOUR_REPO.git
git push -u origin main
```

3. `main` ブランチに push すると、GitHub Actions が自動的にビルドして Pages にデプロイします。
   デプロイ状況は GitHub の `Actions` タブで確認できます。公開 URL は通常 `https://YOUR_USER.github.io/YOUR_REPO/` になります。

注意:
- GitHub Pages の最初の公開には数分かかることがあります。
- カスタムドメインを使う場合は `CNAME` をルートに置くかリポジトリの Pages 設定で設定してください。

ローカル実行（開発）

```powershell
py -3 -m http.server 8000
# ブラウザで http://localhost:8000 を開く
```

問題があれば、デプロイ失敗のログや GitHub Actions のエラーを教えてください。私が調査して修正します。
# Tarkov Task Search (WEB上だけで完結)

## 概要

このアプリは、ブラウザだけで動く Escape from Tarkov のタスクOCR検索ツールです。

- ローカルサーバーは不要
- `npm` や `python` は不要
- ブラウザで `index.html` を直接開くだけで使えます

## 使い方

1. `l:\Tarkov task search\index.html` をブラウザで開きます。
2. 「フォルダを選択」ボタンでスクショ保存先フォルダを選びます。
3. フォルダに画像を追加すると、自動で検出してOCR解析します。
4. 手動アップロードでも画像を解析できます。

## 注意

- フォルダ監視は、ブラウザのファイルシステムアクセス機能を使って定期的にフォルダを再確認します。
- ブラウザによってはフォルダ選択機能が使えない場合があります。その場合は手動アップロードを利用してください。
