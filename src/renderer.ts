import { chromium, PageScreenshotOptions } from "playwright";
import url from "url";

import { Config } from "./config";

type SerializedResponse = {
  status: number;
  content: string;
};

type ViewportDimensions = {
  width: number;
  height: number;
};

const MOBILE_USERAGENT =
  "Mozilla/5.0 (Linux; Android 8.0.0; Pixel 2 XL Build/OPD1.170816.004) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.75 Mobile Safari/537.36";

const DESKTOP_USERAGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

const HEADERS = {
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.google.com/",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
};

/**
 * Wraps Playwright's interface to Headless Chrome to expose high level rendering
 * APIs that are able to handle web components and PWAs.
 */
export class Renderer {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  async serialize(
    requestUrl: string,
    isMobile: boolean
  ): Promise<SerializedResponse> {
    /**
     * Executed on the page after the page has loaded. Strips script and
     * import tags to prevent further loading of resources.
     */
    function stripPage() {
      const elements = document.querySelectorAll(
        'script:not([type]), script[type*="javascript"], link[rel=import]'
      );
      for (const e of Array.from(elements)) {
        e.remove();
      }
    }

    /**
     * Injects a <base> tag which allows other resources to load. This
     * has no effect on serialised output, but allows it to verify render
     * quality.
     */
    function injectBaseHref(origin: string) {
      const base = document.createElement("base");
      base.setAttribute("href", origin);

      const bases = document.head.querySelectorAll("base");
      if (bases.length) {
        const existingBase = bases[0].getAttribute("href") || "";
        if (existingBase.startsWith("/")) {
          bases[0].setAttribute("href", origin + existingBase);
        }
      } else {
        document.head.insertAdjacentElement("afterbegin", base);
      }
    }
    const browser = await chromium.launch({
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--single-process", // <- this one doesn't works in Windows
        "--disable-gpu",
      ],
    });

    const context = await browser.newContext({
      viewport: { width: this.config.width, height: this.config.height },
      userAgent: isMobile ? MOBILE_USERAGENT : DESKTOP_USERAGENT,
      extraHTTPHeaders: HEADERS,
    });
    const page = await context.newPage();

    try {
      await page.addInitScript(() => {
        (window as any).customElements.forcePolyfill = true;
        (window as any).ShadyDOM = { force: true };
        (window as any).ShadyCSS = { shimcssproperties: true };
      });

      let response = await page.goto(requestUrl, {
        timeout: 10000,
        waitUntil: "networkidle",
      });

      if (!response) {
        throw new ScreenshotError("NoResponse");
      }

      if (response.headers()["metadata-flavor"] === "Google") {
        await page.close();
        return { status: 403, content: "" };
      }

      let statusCode = response.status();
      const newStatusCode = await page
        .$eval('meta[name="render:status_code"]', (element) =>
          parseInt(element.getAttribute("content") || "")
        )
        .catch(() => undefined);

      if (statusCode === 304) {
        statusCode = 200;
      }

      if (statusCode === 200 && newStatusCode) {
        statusCode = newStatusCode;
      }

      await page.evaluate(stripPage);
      const parsedUrl = url.parse(requestUrl);
      await page.evaluate(
        injectBaseHref,
        `${parsedUrl.protocol}//${parsedUrl.host}`
      );

      const result = await page.content();

      await page.close();
      await context.close();
      return { status: statusCode, content: result };
    } catch (error) {
      await page.close();
      await context.close();
      return { status: 400, content: "" };
    }
  }

  async screenshot(
    requestUrl: string,
    isMobile: boolean,
    dimensions: ViewportDimensions,
    options?: object
  ): Promise<Buffer> {
    const browser = await chromium.launch({
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--single-process", // <- this one doesn't works in Windows
        "--disable-gpu",
      ],
    });
    const context = await browser.newContext({
      viewport: { width: dimensions.width, height: dimensions.height },
      userAgent: isMobile ? MOBILE_USERAGENT : DESKTOP_USERAGENT,
      extraHTTPHeaders: HEADERS,
    });
    const page = await context.newPage();

    try {
      let response = await page.goto(requestUrl, {
        timeout: 10000,
        waitUntil: "networkidle",
      });

      if (!response) {
        throw new ScreenshotError("NoResponse");
      }

      if (response.headers()["metadata-flavor"] === "Google") {
        throw new ScreenshotError("Forbidden");
      }

      const screenshotOptions = Object.assign({}, options, {
        type: "jpeg",
      });

      const buffer = await page.screenshot(
        screenshotOptions as PageScreenshotOptions
      );
      await page.close();
      await context.close();
      return buffer;
    } catch (error) {
      console.error("Error in screenshot method:", error);
      await page.close();
      await context.close();
      throw error;
    }
  }
}

type ErrorType = "Forbidden" | "NoResponse";

export class ScreenshotError extends Error {
  type: ErrorType;

  constructor(type: ErrorType) {
    super(type);

    this.name = this.constructor.name;
    this.type = type;
  }
}
