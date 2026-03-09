"""
네이버 카페 키워드 크롤러 (v4 - 안정성 개선)

v3 대비 변경사항:
- UA Chrome/124 → Chrome/131 업데이트
- iframe 복수 셀렉터 시도 (DOM 변경 대응)
- iframe 동적 대기 (고정 2초 → 콘텐츠 출현 대기)
- 로그인 리다이렉트 감지 및 스킵
- Anti-headless 대응 (webdriver 속성 제거)
- CRAWLER_VERBOSE=1 시 터미널 상세 로그 출력
"""

import os
import re
import asyncio
import time as _time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote
from playwright.sync_api import sync_playwright
from loguru import logger

_executor = ThreadPoolExecutor(max_workers=3)

# ── 환경변수 기반 설정 ──
VERBOSE = os.getenv("CRAWLER_VERBOSE", "0") == "1"
HEADLESS = os.getenv("CRAWLER_HEADLESS", "1") == "1"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

# Anti-headless: navigator.webdriver 속성 제거
_INIT_SCRIPT = "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"


def _log(msg: str, *args, level: str = "info"):
    """loguru + 터미널 동시 출력 (VERBOSE 모드)."""
    formatted = msg.format(*args) if args else msg
    getattr(logger, level)(formatted)
    if VERBOSE:
        prefix = {"info": "  ", "warning": "[!] ", "error": "[X] ", "debug": "  "}
        safe = formatted.encode("cp949", errors="replace").decode("cp949")
        print(f"[CRAWLER]{prefix.get(level, '  ')}{safe}", flush=True)


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
    """
    urls = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                headless=HEADLESS,
                args=["--incognito", "--disable-blink-features=AutomationControlled"],
            )
            context = browser.new_context(user_agent=UA)
            page = context.new_page()
            page.add_init_script(_INIT_SCRIPT)

            search_url = f"https://search.naver.com/search.naver?query={quote(keyword)}"
            _log("[{}] 검색 URL: {}", keyword, search_url)
            page.goto(search_url, wait_until="domcontentloaded", timeout=30000)

            # 페이지 title 확인 (CAPTCHA 감지)
            page_title = page.title()
            _log("[{}] 페이지 title: '{}'", keyword, page_title)

            # ── 카페 섹션 탐색 (복수 셀렉터) ──
            cafe_section_selectors = [
                "#section_cafe",
                "#cafe_wrap",
                "div[data-tab='cafe']",
                "section[class*='cafe']",
                "div[class*='cafe_area']",
                "div.api_subject_bx",
            ]
            found_section = None
            for sel in cafe_section_selectors:
                try:
                    page.wait_for_selector(sel, timeout=3000)
                    found_section = sel
                    _log("[{}] 카페 섹션 발견: '{}'", keyword, sel)
                    break
                except Exception:
                    continue

            if not found_section:
                _log("[{}] 카페 섹션 미발견 → 3초 대기 후 전체 스캔", keyword, level="warning")
                page.wait_for_timeout(3000)

                # 진단: 페이지 내 주요 섹션 ID/class 출력
                if VERBOSE:
                    sections_info = page.eval_on_selector_all(
                        "section, div[id*='section'], div[class*='cafe']",
                        """els => els.slice(0, 10).map(el => ({
                            tag: el.tagName,
                            id: el.id || '',
                            cls: el.className ? el.className.substring(0, 80) : ''
                        }))"""
                    )
                    _log("[{}] 페이지 섹션 진단:", keyword)
                    for s in sections_info:
                        _log("[{}]   <{}> id='{}' class='{}'", keyword, s['tag'], s['id'], s['cls'])

            # ── 카페 링크 추출 ──
            raw_links = []
            if found_section:
                raw_links = page.eval_on_selector_all(
                    f"{found_section} a[href]",
                    "els => els.map(el => el.href).filter(h => h.includes('cafe.naver.com/'))"
                )
                _log("[{}] '{}' 내 카페 링크 {}개", keyword, found_section, len(raw_links))

            # Fallback: 전체 페이지에서 카페 링크 수집
            if not raw_links:
                raw_links = page.eval_on_selector_all(
                    "a[href]",
                    "els => els.map(el => el.href).filter(h => h.includes('cafe.naver.com/'))"
                )
                _log("[{}] 전체 스캔 카페 링크 {}개", keyword, len(raw_links),
                     level="warning" if raw_links else "error")

            seen = set()
            for link in raw_links:
                clean = link.split("?")[0] if "search.naver.com" not in link else link
                if clean not in seen and _is_cafe_post_url(clean):
                    seen.add(clean)
                    urls.append(link)

            _log("[{}] 최종 유효 URL {}개", keyword, len(urls))
            for i, u in enumerate(urls):
                _log("[{}]   [{}] {}", keyword, i + 1, u[:110])

            browser.close()
    except Exception as e:
        _log("URL 수집 오류 ({}): {}", keyword, e, level="error")

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
        "location": "-",
        "error": None,
    }
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                headless=HEADLESS,
                args=["--incognito", "--disable-blink-features=AutomationControlled"],
            )
            context = browser.new_context(
                user_agent=UA,
                viewport={"width": 1920, "height": 1080},
            )
            cafe_page = context.new_page()
            cafe_page.add_init_script(_INIT_SCRIPT)

            _log("[{}] 게시글 방문: {}", rank_str, cafe_url[:100])
            cafe_page.goto(cafe_url, wait_until="domcontentloaded", timeout=30000)

            # ── 로그인 리다이렉트 감지 ──
            current_url = cafe_page.url
            _log("[{}] 최종 URL: {}", rank_str, current_url[:100])
            if "nid.naver.com" in current_url or "login" in current_url.lower():
                _log("[{}] 로그인 리다이렉트 → 스킵", rank_str, level="warning")
                result["error"] = "login_redirect"
                browser.close()
                return result

            # ── iframe 동적 대기 (고정 2초 → 출현 대기) ──
            try:
                cafe_page.wait_for_selector(
                    "iframe#cafe_main, iframe[name='cafe_main']",
                    timeout=8000,
                )
                _log("[{}] iframe 출현 확인", rank_str)
            except Exception:
                _log("[{}] iframe 8초 내 미출현 → 2초 추가 대기", rank_str, level="warning")
                cafe_page.wait_for_timeout(2000)

            # ── iframe 복수 셀렉터 시도 ──
            iframe_selectors = [
                "iframe#cafe_main",
                "iframe[name='cafe_main']",
                "iframe[src*='cafe.naver.com']",
            ]
            frame = None
            used_selector = None
            for sel in iframe_selectors:
                iframe_el = cafe_page.query_selector(sel)
                if iframe_el:
                    frame = iframe_el.content_frame()
                    if frame:
                        used_selector = sel
                        break

            _log("[{}] iframe: {} (셀렉터: {})", rank_str,
                 "발견" if frame else "미발견", used_selector or "none")

            page_text = ""

            if frame:
                # iframe 콘텐츠 로드 대기
                try:
                    frame.wait_for_load_state("domcontentloaded", timeout=10000)
                except Exception:
                    frame.wait_for_timeout(3000)

                # iframe 로그인 감지
                iframe_url = frame.url
                _log("[{}] iframe URL: {}", rank_str, iframe_url[:100])
                if "nid.naver.com" in iframe_url or "login" in iframe_url.lower():
                    _log("[{}] iframe 로그인 리다이렉트 → 스킵", rank_str, level="warning")
                    result["error"] = "iframe_login_redirect"
                    browser.close()
                    return result

                # iframe 내 콘텐츠 컨테이너 대기
                try:
                    frame.wait_for_selector(
                        "div.se-main-container, div#ct, div.article_viewer, "
                        "div.ContentRenderer, div#postContent",
                        timeout=10000,
                    )
                    _log("[{}] iframe 콘텐츠 컨테이너 발견", rank_str)
                except Exception:
                    _log("[{}] 콘텐츠 컨테이너 미발견 → 5초 대기", rank_str, level="warning")
                    frame.wait_for_timeout(5000)

                # ── 댓글 동적 로딩 트리거 ──
                # 네이버 카페 댓글은 스크롤 시 lazy-load 됨
                try:
                    # 페이지 하단으로 스크롤하여 댓글 로딩 트리거
                    frame.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    _log("[{}] iframe 하단 스크롤 완료", rank_str)

                    # 댓글 영역 출현 대기 (복수 셀렉터)
                    comment_selectors = [
                        "ul.comment_list",
                        "div.comment_area",
                        "div.CommentBox",
                        "div.comment_wrap",
                        "ul.u_cbox_list",
                    ]
                    comment_found = False
                    for csel in comment_selectors:
                        try:
                            frame.wait_for_selector(csel, timeout=5000)
                            comment_found = True
                            _log("[{}] 댓글 영역 발견: '{}'", rank_str, csel)
                            break
                        except Exception:
                            continue

                    if not comment_found:
                        _log("[{}] 댓글 영역 미발견 → 추가 스크롤 + 3초 대기", rank_str, level="warning")
                        # 추가 스크롤 시도
                        for _ in range(3):
                            frame.evaluate("window.scrollBy(0, 500)")
                            frame.wait_for_timeout(500)
                        frame.wait_for_timeout(1500)

                        # 재시도
                        for csel in comment_selectors:
                            try:
                                frame.wait_for_selector(csel, timeout=2000)
                                comment_found = True
                                _log("[{}] 댓글 영역 발견 (재시도): '{}'", rank_str, csel)
                                break
                            except Exception:
                                continue

                    if not comment_found:
                        _log("[{}] 댓글 영역 최종 미발견 (댓글 없는 글일 수 있음)", rank_str, level="warning")
                    else:
                        # 댓글 렌더링 완료 대기
                        frame.wait_for_timeout(1000)

                except Exception as scroll_err:
                    _log("[{}] 댓글 로딩 시도 중 오류: {}", rank_str, str(scroll_err)[:100], level="warning")

                page_text = frame.inner_text("body")
                _log("[{}] iframe body (댓글 포함): {}chars", rank_str, len(page_text))
            else:
                # iframe 미발견 → 진단 로그
                page_text = cafe_page.inner_text("body")
                _log("[{}] page body (iframe 없음): {}chars", rank_str, len(page_text))

                # 페이지 내 모든 iframe 목록 출력 (진단용)
                all_iframes = cafe_page.query_selector_all("iframe")
                if all_iframes:
                    _log("[{}] 페이지 내 iframe {}개:", rank_str, len(all_iframes))
                    for i, ifr in enumerate(all_iframes[:5]):
                        ifr_id = ifr.get_attribute("id") or ""
                        ifr_name = ifr.get_attribute("name") or ""
                        ifr_src = ifr.get_attribute("src") or ""
                        _log("[{}]   [{}] id='{}' name='{}' src='{}'",
                             rank_str, i, ifr_id, ifr_name, ifr_src[:80])

            # ── 텍스트 미리보기 (디버깅) ──
            if VERBOSE and page_text:
                snippet = page_text[:300].replace("\n", " ").strip()
                _log("[{}] 텍스트 미리보기: {}", rank_str, snippet)

            # ── 브랜드 검색 ──
            bl = brand.lower()
            tl = page_text.lower()
            if bl in tl:
                result["found"] = True
                result["location"] = "본문/댓글"
                idx = tl.find(bl)
                context_text = page_text[max(0, idx - 50):idx + len(brand) + 50]
                _log("[{}] 브랜드 '{}' 발견! 주변: ...{}...", rank_str, brand, context_text)
            else:
                _log("[{}] 브랜드 '{}' 미발견 ({}chars)", rank_str, brand, len(page_text),
                     level="warning")

            browser.close()

    except Exception as e:
        result["error"] = str(e)[:200]
        _log("[{}] 예외: {}", rank_str, str(e)[:200], level="error")

    return result


async def check_keyword_exposure(keyword: str, brand: str) -> dict:
    """
    키워드 노출 확인 (병렬 처리).
    1단계: URL 수집 (직렬, 1회)
    2단계: 게시글 방문 (병렬, 최대 3개 동시)
    """
    t0 = _time.time()
    _log("=" * 60)
    _log("노출 확인 시작: keyword='{}' brand='{}'", keyword, brand)
    _log("=" * 60)

    loop = asyncio.get_running_loop()

    # 1단계: URL 수집
    t1 = _time.time()
    cafe_urls = await loop.run_in_executor(_executor, _sync_collect_urls, keyword)
    total = len(cafe_urls)
    _log("[1단계] URL 수집 완료: {}개 ({:.1f}초)", total, _time.time() - t1)

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
        _log("URL 0개 → 종료", level="warning")
        return base_result

    # 2단계: 병렬 게시글 방문
    t2 = _time.time()
    _log("[2단계] 게시글 {}개 병렬 방문 시작", total)
    check_targets = cafe_urls
    tasks = [
        loop.run_in_executor(
            _executor, _sync_check_post, url, brand, f"{idx+1}/{total}"
        )
        for idx, url in enumerate(check_targets)
    ]
    post_results = await asyncio.gather(*tasks, return_exceptions=True)
    _log("[2단계] 게시글 방문 완료 ({:.1f}초)", _time.time() - t2)

    for r in post_results:
        if isinstance(r, Exception):
            base_result["details"].append({"error": str(r)})
            _log("  gather 예외: {}", str(r)[:100], level="error")
            continue
        base_result["details"].append(r)
        if r["found"] and not base_result["found"]:
            base_result["found"] = True
            base_result["rank"] = r["rank"]
            base_result["url"] = r["url"]

    if base_result["found"]:
        base_result["message"] = f"노출됨 (순위: {base_result['rank']})"
    else:
        base_result["message"] = f"전체 {total}개 포스팅 중 브랜드 미발견"

    _log("=" * 60)
    _log("결과: found={} rank={} ({:.1f}초)",
         base_result["found"], base_result["rank"], _time.time() - t0)
    _log("=" * 60)

    return base_result
