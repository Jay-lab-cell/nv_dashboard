"""비대화형 크롤러 진단 — 결과를 diag_result.txt 에 저장."""
import sys, re, os
from urllib.parse import quote

# 결과를 파일에 쓰기
OUT = open(os.path.join(os.path.dirname(__file__), "diag_result.txt"), "w", encoding="utf-8")

def p(msg=""):
    print(msg)
    OUT.write(msg + "\n")
    OUT.flush()

KEYWORD = "여자 방광염 병원"
BRAND   = "베리마노스"

try:
    from playwright.sync_api import sync_playwright
    p("playwright import OK")
except Exception as e:
    p(f"playwright import FAIL: {e}")
    OUT.close(); sys.exit(1)

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

def is_cafe_post(url):
    if "section.cafe.naver.com" in url: return False
    if "cafe.naver.com" not in url: return False
    if "ArticleRead" in url: return True
    clean = url.split("?")[0].split("#")[0]
    m = re.search(r'cafe\.naver\.com(/.*)?$', clean)
    if not m: return False
    parts = [x for x in (m.group(1) or "").split("/") if x]
    return len(parts) >= 2 and parts[-1].isdigit()

p(f"\n{'='*60}")
p(f"[진단] 키워드='{KEYWORD}' / 브랜드='{BRAND}'")
p(f"{'='*60}")

# ── 1단계: URL 수집 ──────────────────────────────────────
p("\n[1단계] URL 수집")
urls = []
try:
    with sync_playwright() as pw:
        br = pw.chromium.launch(headless=True, args=["--no-sandbox","--incognito"])
        ctx = br.new_context(user_agent=UA)
        pg = ctx.new_page()
        search_url = f"https://search.naver.com/search.naver?query={quote(KEYWORD)}"
        p(f"  요청: {search_url}")
        pg.goto(search_url, wait_until="domcontentloaded", timeout=30000)

        # 카페 섹션 대기
        has_section = False
        try:
            pg.wait_for_selector("#section_cafe", timeout=5000)
            has_section = True
            p("  #section_cafe: 발견")
        except:
            p("  #section_cafe: 미발견 — 3초 추가 대기")
            pg.wait_for_timeout(3000)

        sec_links = pg.eval_on_selector_all(
            "#section_cafe a[href]",
            "els => els.map(el => el.href).filter(h => h.includes('cafe.naver.com/'))"
        )
        p(f"  #section_cafe 카페 링크: {len(sec_links)}개")
        for i, u in enumerate(sec_links[:10]):
            p(f"    sec[{i+1}] {u[:100]}")

        all_links = pg.eval_on_selector_all(
            "a[href]",
            "els => els.map(el => el.href).filter(h => h.includes('cafe.naver.com/'))"
        )
        p(f"  전체 a[href] 카페 링크: {len(all_links)}개")
        for i, u in enumerate(all_links[:10]):
            p(f"    all[{i+1}] {u[:100]}")

        # 소스 내 카페 언급
        src = pg.content()
        p(f"  소스 내 'section_cafe': {'YES' if 'section_cafe' in src else 'NO'}")
        p(f"  소스 내 'cafe.naver.com': {'YES' if 'cafe.naver.com' in src else 'NO'}")

        source = sec_links if sec_links else all_links
        seen = set()
        for link in source:
            clean = link.split("?")[0] if "search.naver.com" not in link else link
            if clean not in seen and is_cafe_post(clean):
                seen.add(clean); urls.append(link)

        p(f"\n  최종 유효 URL: {len(urls)}개")
        for i, u in enumerate(urls):
            p(f"    [{i+1}] {u[:110]}")
        br.close()
except Exception as e:
    p(f"  [ERROR] 1단계 실패: {e}")

if not urls:
    p("\n[FAIL] URL 수집 실패")
    OUT.close(); sys.exit(1)

# ── 2단계: 포스팅 방문 ────────────────────────────────────
p(f"\n[2단계] 포스팅 방문 (상위 {min(5,len(urls))}개)")
for i, url in enumerate(urls[:5]):
    rank = f"{i+1}/{len(urls)}"
    p(f"\n  [{rank}] {url[:90]}")
    try:
        with sync_playwright() as pw:
            br = pw.chromium.launch(headless=True, args=["--no-sandbox","--incognito"])
            ctx = br.new_context(user_agent=UA)
            pg = ctx.new_page()
            pg.goto(url, wait_until="domcontentloaded", timeout=30000)
            pg.wait_for_timeout(2000)

            final_url = pg.url
            p(f"    최종 URL: {final_url[:90]}")
            login_wall = "nid.naver.com" in final_url or "/login" in final_url
            p(f"    로그인 차단: {'YES ⚠' if login_wall else 'NO'}")

            iframe_el = pg.query_selector("iframe#cafe_main")
            p(f"    iframe#cafe_main: {'발견' if iframe_el else '미발견'}")

            text = ""
            if iframe_el:
                frame = iframe_el.content_frame()
                if frame:
                    try:
                        frame.wait_for_load_state("domcontentloaded", timeout=10000)
                    except:
                        frame.wait_for_timeout(3000)
                    iframe_url = frame.url
                    p(f"    iframe URL: {iframe_url[:80]}")
                    iframe_login = "nid.naver.com" in iframe_url or "/login" in iframe_url
                    p(f"    iframe 로그인 차단: {'YES ⚠' if iframe_login else 'NO'}")
                    text = frame.inner_text("body")
                else:
                    p("    frame 객체 없음")
            else:
                text = pg.inner_text("body")
                p("    (iframe 없음, page body 사용)")

            p(f"    텍스트 길이: {len(text)} chars")
            found = BRAND.lower() in text.lower()
            p(f"    브랜드 '{BRAND}': {'발견!' if found else '미발견'}")
            if found:
                idx = text.lower().find(BRAND.lower())
                p(f"    주변: ...{text[max(0,idx-40):idx+len(BRAND)+40]}...")
            elif len(text) < 500:
                p(f"    전체 텍스트: {repr(text[:400])}")
            else:
                p(f"    텍스트 앞 300자: {repr(text[:300])}")
            br.close()
            if found:
                p(f"\n[SUCCESS] 순위 {rank}에서 브랜드 발견")
                OUT.close(); sys.exit(0)
    except Exception as e:
        p(f"  [ERROR] {rank} 방문 실패: {e}")

p(f"\n[FAIL] 상위 {min(5,len(urls))}개 포스팅 모두 미발견")
OUT.close()
