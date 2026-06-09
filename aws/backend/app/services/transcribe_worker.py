"""자막 생성을 별도 프로세스로 격리 실행하는 워커.

faster-whisper(ctranslate2)는 영상을 여러 개 연속 처리하면 프로세스 메모리가
누적되어, 결국 백엔드(uvicorn) 전체가 OOM kill 당하고 컨테이너가 재시작되는
문제가 있었다 (파이프라인이 같은 영상에서 무한 재시도하며 멈춘 것처럼 보임).

영상 1개당 새 프로세스에서 처리하고 종료하면, OS가 프로세스 메모리를
완전히 회수하므로 누적이 원천 차단된다.

사용: python -m app.services.transcribe_worker <video_path> <transcript_dir>
"""
import sys

from app.services.transcriber import Transcriber


def main():
    video_path, transcript_dir = sys.argv[1], sys.argv[2]
    transcriber = Transcriber(transcript_dir=transcript_dir)
    segments = transcriber.transcribe(video_path)
    print(f"[Worker] 완료: {len(segments)}개 세그먼트")


if __name__ == "__main__":
    main()
