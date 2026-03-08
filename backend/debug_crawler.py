"""
크롤러 단계별 진단 스크립트

브라우저를 눈으로 보면서 각 단계의 수집 결과를 출력.
미노출 원인이 URL 수집 실패인지 / 브랜드 검색 실패인지 정확히 파악 가능.

사용법:
  cd backend
  .venv\\Scripts\\activate
  python debug_crawler.py "여자 방광염 병원" "베리마노스"
"""

import sys
import re
from urllib.parse import quote
from playwright.sync_api import sync_playwright

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


def _is_cafe_post_url(url: str) -> bool:
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


def step1_collect_urls(keyword: str) -> list[str]:
    """[1단계] 검색 페이지에서 카페 URL 수집 및 분석."""
    print(f"\n{'='*60}")
    print(f"[1단계] URL 수집: '{keyword}'")
    print(f"{'='*60}")

    with sync_playwright() as pw:
        # headless=False: 브라우저를 눈으로 확인
        browser = pw.chromium.launch(headless=False, args=["--start-maximized"])
        context = browser.new_context(user_agent=UA)
        page = context.new_page()

        search_url = f"https://search.naver.com/search.naver?query={quote(keyword)}"
        print(f"검색 URL: {search_url}")
        page.goto(search_url, wait_until="domcontentloaded", timeout=30000)

        # 카페 섹션 대기
        try:
            page.wait_for_selector("#section_cafe", timeout=5000)
            print("[OK] #section_cafe 섹션 발견")
        except Exception:
            print("[!] #section_cafe 미발견 → 3초 추가 대기")
            page.wait_for_timeout(3000)

        # ── 카페 섹션 링크 추출 ──
        section_links = page.eval_on_selector_all(
            "#section_cafe a[href]",
            "els => els.map(el => el.href).filter(h => h.includes('cafe.naver.com/'))"
        )
        print(f"\n▶ [#section_cafe] 카페 링크: {len(section_links)}개")
        for i, u in enumerate(section_links):
            valid = _is_cafe_post_url(u.split("?")[0])
            print(f"  [{i+1}] {'✓' if valid else '✗'} {u[:100]}")

        # ── 전체 스캔 비교 ──
        all_links = page.eval_on_selector_all(
            "a[href]",
            "els => els.map(el => el.href).filter(h => h.includes('cafe.naver.com/'))"
        )
        print(f"\n▶ [전체 a[href]] 카페 링크: {len(all_links)}개")

        # ── 최종 필터 적용 ──
        source = section_links if section_links else all_links
        seen = set()
        filtered = []
        for link in source:
            clean = link.split("?")[0] if "search.naver.com" not in link else link
            if clean not in seen and _is_cafe_post_url(clean):
                seen.add(clean)
                filtered.append(link)

        print(f"\n▶ [최종 유효 포스팅 URL] {len(filtered)}개")
        for i, u in enumerate(filtered):
            print(f"  [{i+1}] {u[:100]}")

        if not filtered:
            print("\n[!] URL 0개 — 원인:")
            print("    A) #section_cafe 셀렉터 불일치 (네이버 DOM 구조 변경)")
            print("    B) 해당 키워드 카페 섹션 없음")
            print("    C) JS 렌더링 타임아웃")
            # 현재 페이지 소스 일부 출력으로 진단 보조
            page_content = page.content()
            has_section = "#section_cafe" in page_content or "section_cafe" in page_content
            print(f"    [소스 확인] 'section_cafe' 텍스트 존재: {has_section}")

        input("\n[Enter] 브라우저 닫고 2단계로...")
        browser.close()
        return filtered


def step2_check_post(url: str, brand: str, rank: str) -> bool:
    """[2단계] 개별 카페 게시글 방문 및 브랜드 검색."""
    print(f"\n{'='*60}")
    print(f"[2단계] 게시글 방문 (순위 {rank})")
    print(f"  URL  : {url[:90]}")
    print(f"  브랜드: '{brand}'")
    print(f"{'='*60}")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False, args=["--start-maximized"])
        context = browser.new_context(user_agent=UA)
        page = context.new_page()

        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(2000)

        current_url = page.url
        print(f"최종 URL: {current_url[:90]}")

        # 로그인 페이지 리다이렉트 감지
        if "nid.naver.com" in current_url or "login" in current_url:
            print("[!] 로그인 페이지로 리다이렉트 — 비로그인 접근 차단됨")
            input("[Enter] 계속...")
            browser.close()
            return False

        iframe_el = page.query_selector("iframe#cafe_main")
        print(f"iframe#cafe_main: {'✓ 발견' if iframe_el else '✗ 미발견'}")

        text = ""
        if iframe_el:
            frame = iframe_el.content_frame()
            if frame:
                try:
                    frame.wait_for_load_state("domcontentloaded", timeout=10000)
                    print("iframe 로드 완료 (domcontentloaded)")
                except Exception as e:
                    print(f"iframe 로드 타임아웃: {e}")
                    frame.wait_for_timeout(3000)

                text = frame.inner_text("body")
                iframe_url = frame.url
                print(f"iframe URL: {iframe_url[:80]}")

                # iframe이 로그인 요구하는지 확인
                if "nid.naver.com" in iframe_url or "login" in iframe_url.lower():
                    print("[!] iframe이 로그인 페이지 로드 중 — 비공개 카페")
            else:
                print("[!] frame 객체 없음")
        else:
            text = page.inner_text("body")
            print("(iframe 없음, page body 사용)")

        print(f"\n텍스트 길이: {len(text)} chars")
        if len(text) < 100:
            print(f"텍스트 전체:\n---\n{text}\n---")
        else:
            print(f"텍스트 앞 400자:\n---\n{text[:400]}\n---")

        found = brand.lower() in text.lower()
        print(f"\n브랜드 '{brand}': {'✓ 발견!' if found else '✗ 미발견'}")
        if found:
            idx = text.lower().find(brand.lower())
            snippet = text[max(0, idx - 60): idx + len(brand) + 60]
            print(f"주변 텍스트: ...{snippet}...")

        input("\n[Enter] 다음으로...")
        browser.close()
        return found


def main():
    keyword = sys.argv[1] if len(sys.argv) > 1 else "여자 방광염 병원"
    brand   = sys.argv[2] if len(sys.argv) > 2 else "베리마노스"

    print(f"\n{'='*60}")
    print(f"크롤러 진단 시작")
    print(f"  키워드: '{keyword}'")
    print(f"  브랜드: '{brand}'")
    print(f"{'='*60}")

    # 1단계: URL 수집
    urls = step1_collect_urls(keyword)

    if not urls:
        print("\n[FAIL] URL 수집 실패 — 크롤러가 검색 결과를 읽지 못하고 있음")
        return

    # 2단계: 상위 5개 방문
    print(f"\n총 {len(urls)}개 URL → 상위 10개 방문")
    for i, url in enumerate(urls[:10]):
        found = step2_check_post(url, brand, f"{i+1}/{len(urls)}")
        if found:
            print(f"\n[SUCCESS] 브랜드 발견 — 순위 {i+1}/{len(urls)}")
            print(f"  URL: {url}")
            return

    print(f"\n[FAIL] 상위 {min(5, len(urls))}개에서 브랜드 미발견")
    print("원인 후보:")
    print("  A) 카페 포스팅이 비공개 (로그인 필요)")
    print("  B) 브랜드명 표기 불일치 (대소문자, 공백, 특수문자)")
    print("  C) 댓글이 추가 JS 로딩 필요 (스크롤 후 렌더링)")


if __name__ == "__main__":
    main()
