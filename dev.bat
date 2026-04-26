@echo off
echo aireply ローカル開発サーバー起動中...
echo.
echo API:      http://localhost:8787
echo フロント: http://localhost:8788
echo.

start "aireply API" cmd /k "npx wrangler dev --port 8787"
timeout /t 3 /nobreak > nul
start "aireply Front" cmd /k "npx serve frontend -p 8788"

echo ブラウザで http://localhost:8788 を開いてください
echo 終了するには各ウィンドウを閉じてください
