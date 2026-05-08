const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5100/login');
  
  await page.fill('input[type="email"]', 'longtham987@gmail.com');
  await page.fill('input[type="password"]', '123456@Aa');
  await page.click('button[type="submit"]');
  await page.waitForNavigation();
  
  await page.waitForSelector('.chat-composer-textarea');
  
  const metrics = await page.evaluate(() => {
    const textarea = document.querySelector('.chat-composer-textarea');
    if (!textarea) return null;
    
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    nativeInputValueSetter.call(textarea, "h\n".repeat(10));
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    
    return new Promise(resolve => {
      setTimeout(() => {
        const style = window.getComputedStyle(textarea);
        resolve({
          height: style.height,
          maxHeight: style.maxHeight,
          minHeight: style.minHeight,
          lineHeight: style.lineHeight,
          paddingTop: style.paddingTop,
          paddingBottom: style.paddingBottom,
          scrollHeight: textarea.scrollHeight,
          inlineHeight: textarea.style.height
        });
      }, 500);
    });
  });
  
  console.log("TEXTAREA METRICS:", metrics);
  await browser.close();
})();
