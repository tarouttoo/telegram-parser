// Шаг 4 цикла «глава за сессию»: reviewer'ы проверяют плотность и атрибуцию
const common = (file, extra) => `Проверка главы книги об алготрейдинге на плотность и атрибуцию.

1. Прочти проверяемый файл: ${file}
2. Прочти эталон правил: research/book/drafts/_rules-for-workers.md (разделы «Плотность», «Одно место на сущность»).
3. Прочти исходники, чтобы выборочно проверить атрибуцию: ${extra}

Проверь:
а) **Факт на абзац**: найди абзацы без нового факта/механизма (вода, связки «как было сказано») — перечисли строками;
б) **Атрибуция**: каждый факт несёт ID поста в скобках; выборочно (не менее 15 ID на главу) сверь факт с исходной note — ID существует и факт соответствует; перечисли любые расхождения (несуществующий ID, искажённая цифра/цитата);
в) **Одно место на сущность**: сущности, чей дом — другая глава, не должны объясняться полноценно здесь; перечисли нарушения;
г) **Один раздел — одна идея**: заголовок обещает ровно то, что внутри; перечисли секции-нарушители;
д) **Указатели «(→ гл. N)»**: корректны ли по карте домов из правил.

Формат ответа: вердикт (годна / годна с правками / не годна), затем нумерованный список конкретных правок с указанием секции и строки. Не переписывай главу целиком — только список правок.`;

const results = await runs.all([
  {
    key: "review-prolog", agent: "reviewer", cwd: "/home/tarouttoo/Projects/telegram-parser",
    task: common(
      "research/book/00-prolog.md",
      "knowledge/notes/011-alko-chronicles.md (основной), research/outline.md (названия глав в таблице карты книги)"
    )
  },
  {
    key: "review-mm", agent: "reviewer", cwd: "/home/tarouttoo/Projects/telegram-parser",
    task: common(
      "research/book/05-mm-evolution.md",
      "knowledge/notes/013-alko-microstructure-mm.md (основной), knowledge/notes/011-alko-chronicles.md (сетки, #1755/#1807/#1386), knowledge/notes/006-wlsbot02-strategies-philosophy.md (wlsbot02), knowledge/notes/001-mm-rollout-patterns.md (grisha#66)"
    )
  }
]);

return results.map((r, i) => ({ key: i === 0 ? "review-prolog" : "review-mm", ok: r.ok, output: String(r.output || "").slice(0, 4000) }));
