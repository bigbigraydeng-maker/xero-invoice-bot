@echo off
cd /d "c:\Users\Zhong\.openclaw\openclaw-feishu-bridge"
git add -A
git commit -m "Clean up project: remove 52 temporary files"
git push origin main
