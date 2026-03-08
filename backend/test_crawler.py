import json
from playwright.sync_api import sync_playwright

def test_mobile():
    keyword = "여자 방광염 병원"
    with sync_playwright() as pw:
        # Launch with mobile viewport and user-agent
        browser = pw.chromium.launch(headless=True, args=["--incognito"])
        mobile_ua = "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36"
        context = browser.new_context(user_agent=mobile_ua, viewport={'width': 390, 'height': 844}, has_touch=True)
        page = context.new_page()
        
        # Test 1: Mobile search URL
        url = f"https://m.search.naver.com/search.naver?query={keyword}"
        print(f"Checking Mobile Search: {url}")
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)
        
        # In mobile naver, cafe article links might look like m.cafe.naver.com
        els = page.query_selector_all("a[href*='cafe.naver.com/']")
        urls = []
        for el in els:
            href = el.get_attribute("href")
            # print("Raw href:", href)
            # clean search tracking or art params if not needed for mobile, but let's keep it untouched
            if "section.cafe" not in href:
                urls.append(href)
                
        # preserve order and remove duplicates
        urls = list(dict.fromkeys(urls))
        print(f"Found {len(urls)} cafe URLs on mobile!")
        for i, u in enumerate(urls):
            print(f" {i+1}. {u}")
            
        browser.close()

if __name__ == "__main__":
    test_mobile()
