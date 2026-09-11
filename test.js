import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs/promises";
import path from "node:path";

// Сложный текст для проверки переносов (hyphenation), висячей пунктуации и выравнивания
const testHtml = `
  <h1>Искусство цифровой типографики</h1>
  <p>
    «Правильный набор текста — это не просто заполнение прямоугольника символами», — утверждал 
    Ян Чихольд. В классическом вебе стандартное выравнивание по ширине часто создает неприятные 
    белые пустоты («реки в наборе»), которые сильно утомляют глаз читателя.
  </p>
  <p>
    Библиотека Justif переносит алгоритм Кнута — Пласса прямо в браузер. Благодаря этому такие 
    сложные и длинные русские слова, как <em>высококвалифицированный</em>, 
    <em>человекоориентированность</em> или <em>достопримечательность</em>, 
    аккуратно делятся мягкими дефисами по слогам, сохраняя оптическую плотность строки идеальной.
  </p>
`;

async function runTest() {
  console.log("1. Запуск MCP-сервера и подключение через stdio...");

  const transport = new StdioClientTransport({
    command: "node",
    args: [path.resolve("dist/index.js")],
  });

  const client = new Client(
    { name: "test-runner", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log("   -> Подключение успешно установлено!");

  console.log("2. Проверка списка доступных инструментов (Tools)...");
  const tools = await client.listTools();
  console.log("   -> Найден инструмент:", tools.tools[0]?.name);

  console.log("3. Отправка тестового фрагмента в 'audit_typography'...");
  const result = await client.callTool({
    name: "audit_typography",
    arguments: {
      html: testHtml,
      width: 700,
      lang: "ru",
    },
  });

  console.log("\n--- ОТВЕТ ОТ MCP СЕРВЕРА ---");
  
  // Ищем текстовый отчет и картинку
  for (const item of result.content) {
    if (item.type === "text") {
      console.log(item.text);
    } else if (item.type === "image") {
      const buffer = Buffer.from(item.data, "base64");
      await fs.writeFile("test-result.png", buffer);
      console.log("\n-> Скриншот успешно сохранен в: test-result.png");
    }
  }

  await client.close();
  console.log("\nТест успешно завершен!");
}

runTest().catch((err) => {
  console.error("Ошибка при выполнении теста:", err);
  process.exit(1);
});