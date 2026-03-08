"""
네이버 카페 키워드 크롤러 (v3 - 병렬 처리 개선)

v1 대비 변경사항:
- URL 수집(직렬 1회) + 게시글 방문(병렬 3개)로 분리
- max_workers: 2 → 3
- 각 포스트 방문을 독립 함수(_sync_check_post)로 분리
"""

import re
import asyncio
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote
from playwright.sync_api import sync_playwright
from loguru import logger

_executor = ThreadPoolExecutor(max_workers=3)

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


def _is_cafe_post_url(url: str) -> bool:
    """실제 카페 포스팅(글) URL인지 판별."""
    if "section.cafe.naver.com" in url:
        return False
    if "cafe.naver.com" not in url:
        return False
    if "ArticleRead" in url:
        return True
    clean = url.split("?")[0].split("#")[0]
    match = re.search(r'cafe\.naver\.com(/.*)?$', clean)
    if not match:
        return False
    path = match.group(1) or ""
    parts = [p for p in path.split("/") if p]
    return len(parts) >= 2 and parts[-1].isdigit()


def _sync_collect_urls(keyword: str) -> list[str]:
    """
    네이버 통합검색으로 카페 포스팅 URL 목록 수집.
    (직렬 실행 - 검색 페이지 1회 방문)

    Fix: #section_cafe 섹션 내 링크 우선 추출 → 실제 검색 순위 반영.
    Fallback: 전체 a[href] 스캔 (섹션 미발견 시).
    """
    urls = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, args=["--incognito"])
            context = browser.new_context(user_agent=UA)
            page = context.new_page()

            # Fix: 공백/한글 URL 인코딩
            search_url = f"https://search.naver.com/search.naver?query={quote(keyword)}"
            page.goto(search_url, wait_until="domcontentloaded", timeout=30000)

            # Fix: 카페 섹션 JS 렌더링 완료까지 명시적 대기 (최대 5초)
            try:
                page.wait_for_selector("#section_cafe", timeout=5000)
                logger.info("[{}] #section_cafe 발견", keyword)
            except Exception:
                logger.warning("[{}] #section_cafe 미발견, 3초 추가 대기", keyword)
                page.wait_for_timeout(3000)

            # Fix: 카페 섹션 내 링크만 우선 추출 → 실제 검색 순위 반영
            raw_links = page.eval_on_selector_all(
                "#section_cafe a[href]",
                "els => els.map(el => el.href).filter(h => h.includes('cafe.naver.com/'))"
            )
            logger.info("[{}] #section_cafe 링크 {}개", keyword, len(raw_links))

            # Fallback: 카페 섹션 링크가 없으면 전체 스캔
            if not raw_links:
                raw_links = page.eval_on_selector_all(
                    "a[href]",
                    "els => els.map(el => el.href).filter(h => h.includes('cafe.naver.com/'))"
                )
                logger.warning("[{}] fallback 전체 스캔 {}개", keyword, len(raw_links))

            seen = set()
            for link in raw_links:
                clean = link.split("?")[0] if "search.naver.com" not in link else link
                if clean not in seen and _is_cafe_post_url(clean):
                    seen.add(clean)
                    urls.append(link)  # 원본 링크(JWT 토큰 포함)를 저장해야 열람 권한이 유지됨

            logger.info("[{}] 최종 유효 URL {}개", keyword, len(urls))
            browser.close()
    except Exception as e:
        logger.error("URL 수집 오류 ({}): {}", keyword, e)

    return urls


def _sync_check_post(cafe_url: str, brand: str, rank_str: str) -> dict:
    """
    개별 카페 게시글 방문 및 브랜드 검색.
    (병렬 실행 - 스레드별 독립 브라우저)
    """
    result = {
        "rank": rank_str,
        "url": cafe_url,
        "found": False,
        "location": "—",
        "error": None,
    }
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, args=["--incognito"])
            context = browser.new_context(user_agent=UA)
            cafe_page = context.new_page()

            cafe_page.goto(cafe_url, wait_until="domcontentloaded", timeout=30000)
            cafe_page.wait_for_timeout(2000)

            comment_text = ""

            iframe_el = cafe_page.query_selector("iframe#cafe_main")
            if iframe_el:
                frame = iframe_el.content_frame()
                if frame:
                    # Fix: 고정 타임아웃 대신 iframe DOM 로드 완료 대기
                    try:
                        frame.wait_for_load_state("domcontentloaded", timeout=10000)
                    except Exception:
                        frame.wait_for_timeout(3000)
                    # 전체 본문+댓글 텍스트를 함께 검색하여 브랜드 누락 방지
                    comment_text = frame.inner_text("body")
                    logger.debug("[{}] iframe body {}chars", rank_str, len(comment_text))
            else:
                # iframe 없을 경우 문서 전체 텍스트 수집
                comment_text = cafe_page.inner_text("body")
                logger.debug("[{}] page body {}chars", rank_str, len(comment_text))

            bl = brand.lower()
            if bl in comment_text.lower():
                result["found"] = True
                result["location"] = "댓글"
                logger.info("[{}] 브랜드 '{}' 발견", rank_str, brand)
            else:
                logger.info("[{}] 브랜드 '{}' 미발견 ({}chars)", rank_str, brand, len(comment_text))

            browser.close()

    except Exception as e:
        result["error"] = str(e)[:80]
        logger.warning("포스트 크롤링 오류 ({}): {}", cafe_url, e)

    return result


async def check_keyword_exposure(keyword: str, brand: str) -> dict:
    """
    키워드 노출 확인 (병렬 처리).
    1단계: URL 수집 (직렬, 1회)
    2단계: 게시글 방문 (병렬, 최대 3개 동시)
    """
    loop = asyncio.get_running_loop()

    # 1단계: URL 수집
    cafe_urls = await loop.run_in_executor(_executor, _sync_collect_urls, keyword)
    total = len(cafe_urls)

    base_result = {
        "found": False,
        "rank": None,
        "total_posts": total,
        "url": None,
        "message": "",
        "details": [],
    }

    if not cafe_urls:
        base_result["message"] = "카페 포스팅 링크를 찾지 못했습니다."
        return base_result

    # 2단계: 병렬 게시글 방문 (전체)
    check_targets = cafe_urls
    tasks = [
        loop.run_in_executor(
            _executor, _sync_check_post, url, brand, f"{idx+1}/{total}"
        )
        for idx, url in enumerate(check_targets)
    ]
    post_results = await asyncio.gather(*tasks, return_exceptions=True)

    for r in post_results:
        if isinstance(r, Exception):
            base_result["details"].append({"error": str(r)})
            continue
        base_result["details"].append(r)
        if r["found"] and not base_result["found"]:
            base_result["found"] = True
            base_result["rank"] = r["rank"]
            base_result["url"] = r["url"]

    if base_result["found"]:
        base_result["message"] = f"노출됨 (댓글, 순위: {base_result['rank']})"
    else:
        base_result["message"] = f"전체 {total}개 포스팅 중 브랜드 미발견"

    return base_result
