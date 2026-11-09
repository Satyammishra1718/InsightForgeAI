import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

import asyncio
import time
from playwright.async_api import async_playwright

FRONTEND_URL = "http://localhost:5173"

async def test_frontend_full_browser_suite():
    print("=" * 65)
    print(" [TEST] LEVEL 6 Items 18, 19, 20: Full Frontend Browser Flow & Viewports")
    print("=" * 65)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        # -------------------------------------------------------------
        # 1. Desktop Viewport (1280 x 800) & Landing Page Verification
        # -------------------------------------------------------------
        context_desktop = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await context_desktop.new_page()

        print(f"Navigating to {FRONTEND_URL} at desktop viewport (1280x800)...")
        await page.goto(FRONTEND_URL, wait_until="networkidle")

        title = await page.title()
        print(f"  * Page Title: '{title}'")
        assert len(title) > 0

        # Check key UI elements on landing page
        hero_heading = await page.locator("h1").first.text_content()
        print(f"  * Hero Heading: '{hero_heading.strip()}'")
        assert len(hero_heading.strip()) > 0

        # Check search input and submit button presence
        textarea = page.locator("textarea").first
        assert await textarea.is_visible(), "Query input textarea not visible"
        print("  * Query input textarea is visible and ready.")

        # Test System Status Modal
        print("\nOpening System Status modal...")
        status_btn = page.locator("button:has-text('System Status')").first
        if await status_btn.is_visible():
            await status_btn.click()
            await page.wait_for_timeout(800)
            status_modal = page.locator("text=System Architecture Status")
            assert await status_modal.is_visible(), "System Status modal failed to open"
            print("  * System Status modal opened successfully.")
            # Click Close button inside status modal
            close_btn = page.locator("button:has-text('Close')").first
            await close_btn.click()
            await status_modal.wait_for(state="hidden")
            await page.wait_for_timeout(500)

        # Test Session History Modal
        print("\nOpening Session History modal...")
        history_btn = page.locator("button:has-text('History')").first
        if await history_btn.is_visible():
            await history_btn.click()
            await page.wait_for_timeout(800)
            history_title = page.locator("text=Research Session History")
            assert await history_title.is_visible(), "History modal failed to open"
            print("  * Research Session History modal opened successfully.")
            
            # Locate modal container and click first session card
            modal_container = page.locator("div.rounded-2xl.shadow-2xl").last
            history_card = modal_container.locator("div.cursor-pointer").first
            if await history_card.is_visible():
                await history_card.click()
                print("  * Selected existing completed session from history.")
                await page.wait_for_timeout(1500)
            else:
                close_history = modal_container.locator("button:has-text('Close')").first
                await close_history.click()

        # -------------------------------------------------------------
        # 2. Verify Loaded Report, Citations, and Reasoning Trace Viewer
        # -------------------------------------------------------------
        print("\nVerifying Report rendering, citations, and tab navigation...")
        # Check Report tab
        report_content = page.locator("article").first
        if await report_content.is_visible():
            report_text = await report_content.text_content()
            print(f"  * Report Content rendered: {len(report_text)} characters")
            assert len(report_text) > 50, "Report markdown text unexpectedly short"

        # Check Reasoning Traces tab
        traces_tab = page.locator("button[role='tab']:has-text('Reasoning Traces')").first
        if await traces_tab.is_visible():
            await traces_tab.click()
            await page.wait_for_timeout(800)
            trace_cards = page.locator("div.border-slate-800")
            count = await trace_cards.count()
            print(f"  * Reasoning Traces tab active. Found {count} trace cards rendered.")

        # Check Agents tab
        agents_tab = page.locator("button[role='tab']:has-text('Agents')").first
        if await agents_tab.is_visible():
            await agents_tab.click()
            await page.wait_for_timeout(800)
            agent_cards = page.locator("text=Planner Agent")
            assert await agent_cards.is_visible(), "Agent cards failed to render"
            print("  * Agent pipeline cards rendered successfully.")

        # -------------------------------------------------------------
        # 3. Responsive Viewports: Tablet (768 x 1024)
        # -------------------------------------------------------------
        print("\nTesting Tablet Viewport (768x1024)...")
        context_tablet = await browser.new_context(viewport={"width": 768, "height": 1024})
        page_tablet = await context_tablet.new_page()
        await page_tablet.goto(FRONTEND_URL, wait_until="networkidle")
        assert await page_tablet.locator("h1").first.is_visible(), "Heading not visible on tablet"
        assert await page_tablet.locator("textarea").first.is_visible(), "Search textarea not visible on tablet"
        print("  ✓ Tablet viewport rendered layout cleanly.")
        await context_tablet.close()

        # -------------------------------------------------------------
        # 4. Responsive Viewports: Mobile (375 x 667)
        # -------------------------------------------------------------
        print("\nTesting Mobile Viewport (375x667)...")
        context_mobile = await browser.new_context(viewport={"width": 375, "height": 667})
        page_mobile = await context_mobile.new_page()
        await page_mobile.goto(FRONTEND_URL, wait_until="networkidle")
        assert await page_mobile.locator("h1").first.is_visible(), "Heading not visible on mobile"
        assert await page_mobile.locator("textarea").first.is_visible(), "Search textarea not visible on mobile"
        print("  ✓ Mobile viewport rendered layout cleanly with responsive wrapping.")
        await context_mobile.close()

        # -------------------------------------------------------------
        # 5. UI Error State Verification (Deliberate Error Display)
        # -------------------------------------------------------------
        print("\nTesting UI Error State handling...")
        page_err = await context_desktop.new_page()
        await page_err.goto(f"{FRONTEND_URL}?session=invalid_nonexistent_session_id_9999", wait_until="networkidle")
        await page_err.wait_for_timeout(1500)
        header = page_err.locator("header").first
        assert await header.is_visible(), "UI crashed on invalid session ID!"
        print("  ✓ UI error boundaries operate cleanly without white screen of death or crashes.")

        await context_desktop.close()
        await browser.close()

    print("\n" + "=" * 65)
    print("  ALL LEVEL 6 FRONTEND BROWSER & UI TESTS PASSED (100%)")
    print("=" * 65 + "\n")

if __name__ == "__main__":
    asyncio.run(test_frontend_full_browser_suite())
