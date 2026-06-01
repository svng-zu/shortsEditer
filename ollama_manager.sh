#!/bin/bash
# ollama_manager.sh

MODEL="gemma3:27b"

start() {
    echo "🚀 Ollama 시작 중..."

    # 기존 ollama 프로세스 강제 종료
    OLLAMA_PID=$(sudo lsof -t -i :11434 2>/dev/null)
    if [ -n "$OLLAMA_PID" ]; then
        echo "  기존 프로세스 종료 (PID: $OLLAMA_PID)"
        sudo kill -9 $OLLAMA_PID
        sleep 2
    fi

    # ollama serve 백그라운드 실행
    OLLAMA_KEEP_ALIVE=-1 ollama serve > /tmp/ollama.log 2>&1 &
    sleep 5

    # 모델 로딩
    echo "📦 모델 로딩 중: $MODEL (30초 정도 걸려요)"
    ollama run $MODEL "준비" > /dev/null 2>&1
    echo ""
    ollama ps
    echo "✅ 준비 완료!"
}

stop() {
    echo "🛑 Ollama 종료 중..."
    OLLAMA_PID=$(sudo lsof -t -i :11434 2>/dev/null)
    if [ -n "$OLLAMA_PID" ]; then
        sudo kill -9 $OLLAMA_PID
        echo "✅ 종료 완료! (PID: $OLLAMA_PID)"
    else
        echo "실행 중인 Ollama가 없습니다."
    fi
}

status() {
    echo "📊 Ollama 상태:"
    OLLAMA_PID=$(sudo lsof -t -i :11434 2>/dev/null)
    if [ -n "$OLLAMA_PID" ]; then
        echo "  실행 중 (PID: $OLLAMA_PID)"
        ollama ps
    else
        echo "  실행 중이지 않음"
    fi
}

case "$1" in
    start)  start ;;
    stop)   stop ;;
    status) status ;;
    *)
        echo "사용법: ./ollama_manager.sh [start|stop|status]"
        ;;
esac