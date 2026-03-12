const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Capture console messages
  const consoleMessages = [];
  page.on('console', msg => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text()
    });
  });
  
  // Capture page errors
  const pageErrors = [];
  page.on('pageerror', error => {
    pageErrors.push(error.toString());
  });
  
  // Navigate to the page
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle' });
  
  // Wait a bit for React to render
  await page.waitForTimeout(3000);
  
  // Take a screenshot
  await page.screenshot({ path: '/Users/shonanhendre/Desktop/rttm-lidar-labeler/screenshot.png', fullPage: true });
  
  // Get canvas information
  const canvasInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
      return { exists: false };
    }
    
    const computedStyle = window.getComputedStyle(canvas);
    const rect = canvas.getBoundingClientRect();
    const parent = canvas.parentElement;
    const parentStyle = parent ? window.getComputedStyle(parent) : null;
    const parentRect = parent ? parent.getBoundingClientRect() : null;
    
    // Get grandparent and great-grandparent
    const grandparent = parent ? parent.parentElement : null;
    const grandparentStyle = grandparent ? window.getComputedStyle(grandparent) : null;
    const grandparentRect = grandparent ? grandparent.getBoundingClientRect() : null;
    
    const greatGrandparent = grandparent ? grandparent.parentElement : null;
    const greatGrandparentStyle = greatGrandparent ? window.getComputedStyle(greatGrandparent) : null;
    const greatGrandparentRect = greatGrandparent ? greatGrandparent.getBoundingClientRect() : null;
    
    return {
      exists: true,
      attributes: {
        width: canvas.getAttribute('width'),
        height: canvas.getAttribute('height'),
        style: canvas.getAttribute('style')
      },
      computed: {
        width: computedStyle.width,
        height: computedStyle.height,
        display: computedStyle.display
      },
      boundingRect: {
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left
      },
      parent: parent ? {
        tagName: parent.tagName,
        className: parent.className,
        computed: {
          width: parentStyle.width,
          height: parentStyle.height,
          overflow: parentStyle.overflow,
          position: parentStyle.position
        },
        boundingRect: {
          width: parentRect.width,
          height: parentRect.height,
          top: parentRect.top,
          left: parentRect.left
        }
      } : null,
      grandparent: grandparent ? {
        tagName: grandparent.tagName,
        className: grandparent.className,
        computed: {
          width: grandparentStyle.width,
          height: grandparentStyle.height,
          overflow: grandparentStyle.overflow,
          position: grandparentStyle.position
        },
        boundingRect: {
          width: grandparentRect.width,
          height: grandparentRect.height,
          top: grandparentRect.top,
          left: grandparentRect.left
        }
      } : null,
      greatGrandparent: greatGrandparent ? {
        tagName: greatGrandparent.tagName,
        className: greatGrandparent.className,
        computed: {
          width: greatGrandparentStyle.width,
          height: greatGrandparentStyle.height,
          overflow: greatGrandparentStyle.overflow,
          position: greatGrandparentStyle.position
        },
        boundingRect: {
          width: greatGrandparentRect.width,
          height: greatGrandparentRect.height,
          top: greatGrandparentRect.top,
          left: greatGrandparentRect.left
        }
      } : null
    };
  });
  
  // Get visible text content
  const pageContent = await page.evaluate(() => {
    return {
      title: document.title,
      visibleText: document.body.innerText.substring(0, 500)
    };
  });
  
  // Output results
  console.log('=== PAGE INSPECTION RESULTS ===\n');
  
  console.log('1. VISIBLE CONTENT:');
  console.log('Title:', pageContent.title);
  console.log('Visible text:', pageContent.visibleText);
  console.log('\n');
  
  console.log('2. CONSOLE MESSAGES:');
  if (consoleMessages.length === 0) {
    console.log('No console messages');
  } else {
    consoleMessages.forEach(msg => {
      console.log(`[${msg.type}]`, msg.text);
    });
  }
  console.log('\n');
  
  console.log('3. PAGE ERRORS:');
  if (pageErrors.length === 0) {
    console.log('No page errors');
  } else {
    pageErrors.forEach(err => {
      console.log(err);
    });
  }
  console.log('\n');
  
  console.log('4. CANVAS ELEMENT:');
  console.log(JSON.stringify(canvasInfo, null, 2));
  console.log('\n');
  
  console.log('Screenshot saved to screenshot.png');
  
  await browser.close();
})();
