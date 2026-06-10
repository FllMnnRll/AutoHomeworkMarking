@echo off
cd /d E:\AutoHomeworkMarking
set PORT=3001
set GRADING_CONCURRENCY=3
call npm run dev > E:\AutoHomeworkMarking\scratch\dev_server.log 2>&1
