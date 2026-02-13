import fs from "node:fs";
import path from "node:path";

const outPath = path.resolve("docs/notion-like-qa/04-checklist-500.md");

let id = 1;
const sections = [];

function idLabel() {
  return `NL-${String(id++).padStart(3, "0")}`;
}

function addSection(title, items) {
  sections.push({ title, items });
}

function formatItem(item) {
  const caseId = idLabel();
  return `- [ ] ${caseId} | ${item.action} | Ожидание: ${item.expected} | Приоритет: ${item.priority} | Авто: ${item.automation}`;
}

/* A. Caret and selection fundamentals (60) */
{
  const contexts = [
    "пустой paragraph",
    "paragraph с простым текстом",
    "paragraph с mixed marks (bold/italic)",
    "heading 1",
    "heading 2",
    "bullet item с текстом",
    "bullet item без текста",
    "ordered item с текстом",
    "todo item без текста",
    "todo item с текстом",
  ];

  const actions = [
    {
      action: "Клик в начало блока",
      expected: "каретка ставится в начало содержимого, без скачка в левый край",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Клик в середину текста",
      expected: "каретка ставится на ожидаемую позицию символа",
      priority: "P1",
      automation: "E2E",
    },
    {
      action: "Клик в конец текста",
      expected: "каретка на конце блока, ввод продолжает этот блок",
      priority: "P1",
      automation: "E2E",
    },
    {
      action: "ArrowLeft из позиции 0",
      expected: "переход в конец предыдущего блока без пропуска и краша",
      priority: "P1",
      automation: "Planned",
    },
    {
      action: "ArrowRight из конца блока",
      expected: "переход в начало следующего блока без рассинхрона",
      priority: "P1",
      automation: "Planned",
    },
    {
      action: "Mouse drag выделение в соседний блок",
      expected: "диапазон визуально сохраняется, toolbar/bubble реагирует корректно",
      priority: "P1",
      automation: "Planned",
    },
  ];

  const items = [];
  for (const ctx of contexts) {
    for (const act of actions) {
      items.push({
        action: `${act.action} (${ctx})`,
        expected: act.expected,
        priority: act.priority,
        automation: act.automation,
      });
    }
  }
  addSection("A. Caret & Selection Fundamentals (60)", items);
}

/* B. Typing and line breaks (60) */
{
  const contexts = [
    "пустой paragraph",
    "paragraph с текстом",
    "heading 1",
    "heading 3",
    "bullet item",
    "ordered item",
    "todo item",
    "blockquote",
    "code block",
    "callout",
  ];

  const actions = [
    {
      action: "Ввод обычного текста",
      expected: "символы появляются один раз, без дублей и пропусков",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Нажатие Enter",
      expected: "создаётся корректный следующий блок/элемент списка",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Нажатие Shift+Enter",
      expected: "добавляется soft line break внутри текущего блока",
      priority: "P1",
      automation: "Planned",
    },
    {
      action: "Backspace в середине строки",
      expected: "удаляется 1 символ слева, каретка не прыгает",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Backspace в начале строки",
      expected: "merge/unwrap происходит предсказуемо по типу блока",
      priority: "P0",
      automation: "Planned",
    },
    {
      action: "Delete (forward)",
      expected: "удаляется символ справа без потери выделения",
      priority: "P1",
      automation: "Planned",
    },
  ];

  const items = [];
  for (const ctx of contexts) {
    for (const act of actions) {
      items.push({
        action: `${act.action} (${ctx})`,
        expected: act.expected,
        priority: act.priority,
        automation: act.automation,
      });
    }
  }
  addSection("B. Typing, Enter, Backspace (60)", items);
}

/* C. Slash menu behavior (80) */
{
  const contexts = [
    "пустой paragraph",
    "начало непустого paragraph",
    "середина paragraph",
    "конец heading",
    "пустой bullet item",
    "todo item с текстом",
    "сразу после paste",
    "у нижней границы viewport",
    "у правой границы viewport",
    "в dark theme",
  ];

  const actions = [
    {
      action: "Ввод '/'",
      expected: "menu открывается у каретки, не в левом верхнем углу",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Ввод '/to'",
      expected: "фильтрация корректная, релевантные команды сверху",
      priority: "P1",
      automation: "E2E",
    },
    {
      action: "ArrowDown + Enter",
      expected: "выбранная команда исполняется без потери фокуса",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "ArrowUp + Enter",
      expected: "навигация вверх работает циклично/предсказуемо",
      priority: "P1",
      automation: "Planned",
    },
    {
      action: "Esc",
      expected: "menu закрывается, документ не мутируется",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Клик вне menu",
      expected: "menu закрывается, editor остаётся интерактивным",
      priority: "P1",
      automation: "E2E",
    },
    {
      action: "Запрос без совпадений",
      expected: "показывается empty-state, layout не ломается",
      priority: "P1",
      automation: "Planned",
    },
    {
      action: "Удаление query backspace до пустого",
      expected: "список команд возвращается в дефолтный порядок",
      priority: "P2",
      automation: "Planned",
    },
  ];

  const items = [];
  for (const ctx of contexts) {
    for (const act of actions) {
      items.push({
        action: `${act.action} (${ctx})`,
        expected: act.expected,
        priority: act.priority,
        automation: act.automation,
      });
    }
  }
  addSection("C. Slash Menu UX & Positioning (80)", items);
}

/* D. Transform matrix via slash (120) */
{
  const sources = [
    "paragraph",
    "heading 1",
    "heading 2",
    "heading 3",
    "bullet item",
    "ordered item",
    "todo item",
    "blockquote",
    "code block",
    "callout",
  ];

  const targets = [
    "text",
    "heading 1",
    "heading 2",
    "heading 3",
    "bullet list",
    "numbered list",
    "todo list",
    "blockquote",
    "code block",
    "divider",
    "table",
    "image",
  ];

  const items = [];
  for (const src of sources) {
    for (const dst of targets) {
      items.push({
        action: `Slash transform: ${src} -> ${dst}`,
        expected: "целевой блок создаётся валидно, текст текущей строки не теряется, caret остаётся в новом блоке",
        priority: "P0",
        automation: "Planned",
      });
    }
  }
  addSection("D. Slash Transform Cross-Matrix (120)", items);
}

/* E. Todo/list edge cases (70) */
{
  const contexts = [
    "первый item списка",
    "средний item списка",
    "последний item списка",
    "item с длинным текстом",
    "item с inline marks",
    "пустой item",
    "item после paste",
    "item после undo/redo",
    "item сразу после slash transform",
    "item в dark theme",
  ];

  const actions = [
    {
      action: "Click checkbox",
      expected: "state checked меняется, текст остаётся на месте и не скачет",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Caret placement в пустом todo",
      expected: "каретка ставится после checkbox в текстовой зоне",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Ввод текста в todo",
      expected: "текст вертикально выровнен с checkbox, gap стабильный",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Enter в непустом todo",
      expected: "создаётся следующий todo item",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Enter в пустом todo",
      expected: "выход в paragraph вне списка",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Slash convert todo -> bullet",
      expected: "текст строки сохраняется, тип меняется без пропадания строки",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Slash convert bullet -> todo",
      expected: "текст строки сохраняется, checkbox корректно рендерится",
      priority: "P0",
      automation: "E2E",
    },
  ];

  const items = [];
  for (const ctx of contexts) {
    for (const act of actions) {
      items.push({
        action: `${act.action} (${ctx})`,
        expected: act.expected,
        priority: act.priority,
        automation: act.automation,
      });
    }
  }
  addSection("E. Todo/List Stress Cases (70)", items);
}

/* F. Formatting and selection retention (40) */
{
  const contexts = [
    "selection внутри paragraph",
    "selection внутри heading",
    "selection внутри bullet item",
    "selection внутри ordered item",
    "selection внутри todo item",
    "selection через 2 блока",
    "collapsed caret в середине слова",
    "collapsed caret в конце слова",
  ];

  const actions = [
    {
      action: "Toggle Bold",
      expected: "mark применяется корректно, визуальное выделение не пропадает преждевременно",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Toggle Italic",
      expected: "mark применяется на текущий range без потери focus",
      priority: "P1",
      automation: "E2E",
    },
    {
      action: "Toggle Underline",
      expected: "mark включается/выключается симметрично",
      priority: "P1",
      automation: "Planned",
    },
    {
      action: "Command via bubble menu",
      expected: "bubble menu остаётся консистентной и не ломает selection",
      priority: "P1",
      automation: "Planned",
    },
    {
      action: "Command via keyboard shortcut",
      expected: "горячая клавиша совпадает с поведением toolbar",
      priority: "P1",
      automation: "Planned",
    },
  ];

  const items = [];
  for (const ctx of contexts) {
    for (const act of actions) {
      items.push({
        action: `${act.action} (${ctx})`,
        expected: act.expected,
        priority: act.priority,
        automation: act.automation,
      });
    }
  }
  addSection("F. Formatting & Highlight Retention (40)", items);
}

/* G. Clipboard, IME, history (30) */
{
  const contexts = [
    "paragraph",
    "heading",
    "bullet item",
    "todo item",
    "code block",
    "multi-block selection",
  ];

  const actions = [
    {
      action: "Copy + Paste",
      expected: "текст вставляется без дубликатов, структура не ломается",
      priority: "P1",
      automation: "Planned",
    },
    {
      action: "Cut + Undo",
      expected: "после undo состояние восстанавливается полностью",
      priority: "P1",
      automation: "Planned",
    },
    {
      action: "IME composition",
      expected: "композиция не теряется, символы не удваиваются",
      priority: "P0",
      automation: "Manual",
    },
    {
      action: "Undo/Redo цепочка (10 шагов)",
      expected: "история детерминирована, нет расхождения DOM/state",
      priority: "P0",
      automation: "Planned",
    },
    {
      action: "Slash + Undo + Redo",
      expected: "transform и обратные операции стабильны",
      priority: "P0",
      automation: "E2E",
    },
  ];

  const items = [];
  for (const ctx of contexts) {
    for (const act of actions) {
      items.push({
        action: `${act.action} (${ctx})`,
        expected: act.expected,
        priority: act.priority,
        automation: act.automation,
      });
    }
  }
  addSection("G. Clipboard, IME, Undo/Redo (30)", items);
}

/* H. Gutter, drag and block controls (20) */
{
  const contexts = [
    "paragraph",
    "heading",
    "bullet list",
    "todo list",
    "code block",
  ];

  const actions = [
    {
      action: "Hover left gutter",
      expected: "кнопки + и drag-handle появляются рядом с блоком, не на внешнем левом краю",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Click plus button",
      expected: "вставка блока работает без смещения активной строки",
      priority: "P1",
      automation: "Planned",
    },
    {
      action: "Drag block вниз",
      expected: "блок переносится, содержимое и selection сохраняются",
      priority: "P1",
      automation: "Manual",
    },
    {
      action: "Drag block вверх",
      expected: "порядок меняется корректно, без визуальных артефактов",
      priority: "P1",
      automation: "Manual",
    },
  ];

  const items = [];
  for (const ctx of contexts) {
    for (const act of actions) {
      items.push({
        action: `${act.action} (${ctx})`,
        expected: act.expected,
        priority: act.priority,
        automation: act.automation,
      });
    }
  }
  addSection("H. Gutter Toolbar & Drag Controls (20)", items);
}

/* I. Theme, responsive, accessibility (20) */
{
  const contexts = [
    "desktop light theme",
    "desktop dark theme",
    "mobile viewport 390px",
    "tablet viewport 768px",
    "системная тема auto",
  ];

  const actions = [
    {
      action: "Открыть slash-menu",
      expected: "цвета, тени, border и padding консистентны с темой",
      priority: "P1",
      automation: "E2E",
    },
    {
      action: "Проверить overflow search/menu body",
      expected: "инпут и пункты не вылезают за контейнер",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Keyboard navigation (Up/Down/Enter/Esc)",
      expected: "все клавиши работают одинаково в обеих темах",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Screen reader semantics",
      expected: "role/aria-атрибуты валидны, фокус читается корректно",
      priority: "P2",
      automation: "Manual",
    },
  ];

  const items = [];
  for (const ctx of contexts) {
    for (const act of actions) {
      items.push({
        action: `${act.action} (${ctx})`,
        expected: act.expected,
        priority: act.priority,
        automation: act.automation,
      });
    }
  }
  addSection("I. Theme, Responsive, A11y (20)", items);
}

const totalCases = sections.reduce((sum, sec) => sum + sec.items.length, 0);
if (totalCases !== 500) {
  throw new Error(`Expected 500 cases, got ${totalCases}`);
}

const lines = [];
lines.push("# Notion-like QA Checklist (500 действий)");
lines.push("");
lines.push("_Last updated: February 13, 2026_");
lines.push("");
lines.push("## Как использовать");
lines.push("");
lines.push("- Каждый пункт — отдельный тест-кейс поведения редактора.");
lines.push("- `Авто: E2E` — можно/нужно покрыть Playwright тестом.");
lines.push("- `Авто: Planned` — добавить в автоматизацию в следующих итерациях.");
lines.push("- `Авто: Manual` — пока только ручная проверка (обычно IME/DnD/a11y кейсы).");
lines.push("");
lines.push(`Всего кейсов: **${totalCases}**.`);
lines.push("");

for (const section of sections) {
  lines.push(`## ${section.title}`);
  lines.push("");
  for (const item of section.items) {
    lines.push(formatItem(item));
  }
  lines.push("");
}

fs.writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Generated ${outPath} with ${totalCases} cases.`);
