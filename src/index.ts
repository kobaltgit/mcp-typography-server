import process from "node:process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { chromium, type Browser } from "playwright";

// Инициализируем MCP сервер
const server = new McpServer({
  name: "typography-audit-server",
  version: "1.0.0",
});

let browser: Browser | null = null;

async function getBrowser() {
  if (!browser) {
    browser = await chromium.launch({ headless: true });
  }
  return browser;
}

// Регистрируем инструмент для агента
server.tool(
  "audit_typography",
  "Рендерит HTML-код, применяет Justif (алгоритм Кнута-Пласса) и возвращает скриншот с аудитом верстки",
  {
    html: z.string().describe("HTML-код страницы или фрагмента статьи"),
    width: z.number().default(800).describe("Ширина экрана для проверки в пикселях (например, 375 для мобилки, 800 для планшета)"),
    lang: z.string().default("ru").describe("Язык текста для правил переноса ('ru', 'en-us' и т.д.)"),
  },
  async ({ html, width, lang }) => {
    const b = await getBrowser();
    const page = await b.newPage({ viewport: { width, height: 1000 } });

    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    // Оборачиваем фрагмент в базовый HTML с подключением Justif, если передан сырой кусок
    const fullHtml = html.includes("<html")
      ? html
      : `
        <!DOCTYPE html>
        <html lang="${lang}">
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Georgia, serif; padding: 2rem; }
            article { max-width: 65ch; margin: 0 auto; line-height: 1.6; font-size: 18px; }
            article p { text-align: justify; }
          </style>
          <script type="module" src="https://cdn.jsdelivr.net/npm/justif@0.9.1/dist/auto.js"></script>
        </head>
        <body>
          <article>${html}</article>
        </body>
        </html>
      `;

    await page.setContent(fullHtml, { waitUntil: "networkidle" });

    // Даем 300мс на выполнение JS-скриптов Justif и отрисовку Canvas
    await page.waitForTimeout(300);

    // Проверяем, задан ли атрибут lang
    const pageLang = await page.getAttribute("html", "lang");
    const warnings: string[] = [];
    if (!pageLang) {
      warnings.push("Внимание: на теге <html> не задан атрибут lang. Переносы (hyphenation) не смогут корректно работать.");
    }

    // Делаем скриншот контейнера
    const screenshotBuffer = await page.screenshot({ fullPage: false });
    await page.close();

    const base64Image = screenshotBuffer.toString("base64");

    const report = [
      `### Отчет по типографике:`,
      `- Ширина вьюпорта: ${width}px`,
      `- Язык документа: ${pageLang || "не указан"}`,
      `- JS-ошибки: ${errors.length > 0 ? errors.join(", ") : "Отсутствуют"}`,
      warnings.length > 0 ? `- Предупреждения:\n  ${warnings.join("\n  ")}` : "- Замечаний по разметке нет.",
    ].join("\n");

    // Возвращаем агенту и текст, и изображение (агент сможет увидеть верстку глазами)
    return {
      content: [
        {
          type: "text",
          text: report,
        },
        {
          type: "image",
          data: base64Image,
          mimeType: "image/png",
        },
      ],
    };
  }
);

// Запуск сервера через стандартные потоки ввода/вывода (stdio)
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Typography MCP Server запущен на stdio");
}

main().catch((err) => {
  console.error("Ошибка запуска сервера:", err);
  process.exit(1);
});