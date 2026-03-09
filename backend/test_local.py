"""
로컬 크롤러 Verbose 테스트

사용법:
  cd backend
  python test_local.py "호관원 부작용" "오쏘메드 글리콘"

브라우저를 보며 테스트:
  set CRAWLER_HEADLESS=0 && python test_local.py "호관원 부작용" "오쏘메드 글리콘"
"""
import sys
import os
import asyncio
import json
import io

# Windows 터미널 UTF-8 출력 설정
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# Verbose 모드 강제 활성화
os.environ["CRAWLER_VERBOSE"] = "1"

from crawler import check_keyword_exposure


async def main():
    keyword = sys.argv[1] if len(sys.argv) > 1 else "호관원 부작용"
    brand = sys.argv[2] if len(sys.argv) > 2 else "오쏘메드 글리콘"

    print(f"\n{'='*70}")
    print(f"  크롤러 로컬 테스트")
    print(f"  키워드: {keyword}")
    print(f"  브랜드: {brand}")
    print(f"  Headless: {os.getenv('CRAWLER_HEADLESS', '1')}")
    print(f"{'='*70}\n")

    result = await check_keyword_exposure(keyword, brand)

    print(f"\n{'='*70}")
    print(f"  최종 결과")
    print(f"{'='*70}")
    print(json.dumps(result, indent=2, ensure_ascii=False))

    if result["found"]:
        print(f"\n  [O] 브랜드 발견! 순위: {result['rank']}")
    else:
        print(f"\n  [X] 브랜드 미발견")
        print(f"  상세:")
        for d in result.get("details", []):
            err = d.get("error", "")
            rank = d.get("rank", "?")
            status = "에러" if err else "미발견"
            print(f"    [{rank}] {status}" + (f" ({err})" if err else ""))


if __name__ == "__main__":
    asyncio.run(main())
