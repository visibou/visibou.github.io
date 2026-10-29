@echo off
rem Opens the Privilea terminal full-screen in Chrome. Alt+F4 to quit.
rem Touchscreen-safe: pinch-zoom and swipe-back are disabled.
start "" chrome --kiosk --disable-pinch --overscroll-history-navigation=0 --autoplay-policy=no-user-gesture-required "file:///%~dp0index.html"
