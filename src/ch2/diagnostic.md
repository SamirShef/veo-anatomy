# Диагностика

---

Начало: 27.05.2026, 11:37:10
Конец: -

---

Компилятор, как я говорил ранее, --- это не просто программа, которая переводит текст в бинарь. Это целый конвейер, который ещё и должен быть устойчив к авариям
(синтаксические и семантические ошибки и т.д.). Если конвейер попадет в аварию, он не должен тут же разрушиться (аварийно завершить свою работу). Он должен
четко сказать, где и как произошла авария, затем обеспечить себе безопасный контекст (пропустить ошибку, как будто её очага никогда не было) и работать дальше.
Вывод ошибки тоже должен быть грамотным, мы же не хотим получить `Syntax error at file:line:col` без каких-либо пояснений. Но перебарщивать тоже не нужно, мы
же не хотим получить тонну мусора (`C++` ошибки при работе с дженериками). Нужен аккуратный вывод, без лишней воды и всего подобного. Как он будет выглядеть ---
решайте сами, но лично я вдохновлялся ошибками из `Rust`. Я не смог полностью повторить это, но смог хотя бы выводить ошибки красиво. Но помимо красивого вывода...
Нам нужно красиво создавать ошибки. Мы, как разработчики современного компилятора, должны понимать, что проверок будет очень много, а выводов ошибок будет ещё
больше. Поэтому нам нужно позаботиться и о себе --- написать такое API, которое позволит легко и изящно создавать ошибки, точнее объекты, которые будут хранить
информацию об ошибке. А дальше эти объекты будут отрисовываться специальным движком --- движком диагностики. Он будет создавать красоту вывода: цвета, стиль, весь
вывод в целом.

Так как вывод ошибок нам нужен будет почти во всех частях компилятора, то с нее логичнее будет начать. Говорю сразу --- будет сложно!

## Временные объекты

С чего бы начать? Наверное, с вопроса: "а как и где хранить данные об ошибке?". Я использовал временные объекты. Существует какой-то объект, который хранит в себе
данные об ошибке (позиция в файле, сообщение, код ошибки и тд). Этот временный объект добавляется в движок, чтобы тот о нем знал, и по команде движок начнет рендер
этих объектов.

## Позиция в файле и менеджеры ресурсов

Как хранить позицию в файле и само имя файла? Можно, конечно написать структуру:

```cpp
$#include <cstdint>
$
$namespace veo::diagnostic {
$
struct Span {
    uint64_t Line;
    uint64_t Col;
    std::string FileName;
}
$
$}
```

Но такие структуры надо копировать, причем копировать часто. Эта структура слишком тяжелая для копирования, поэтому нужен другой вариант. И такой вариант
действительно есть: `llvm::SMLoc`. `llvm::SMLoc` --- объект из экосистемы LLVM, который нужен для хранения позиции в файле. Механизм очень хитрый: `llvm::SMLoc`
состоит из единственного поля --- указателя на символ в файле. По этому указателю специальный класс `llvm::SourceMgr` сможет вычислить строку, столбец и найти само
имя файла. `llvm::SMLoc` весит всего 8 байт (указатель), что идеально подходит для копирования, поэтому мой выбор остановился именно на нем.

`llvm::SourceMgr` --- это объект из экосистемы LLVM, отвечающий за хранение буферов файлов. Благодаря тому, что он хранит буферы, можно вычислять позиции из
`llvm::SMLoc`. Но будьте осторожны --- как только `llvm::SourceMgr` удалится, все `llvm::SMLoc` станут невалидны и будут ссылаться на **мусор**! Поэтому
`llvm::SourceMgr` должен создаваться один раз и, в случае чего, передаваться по ссылке. У каждого буфера в `llvm::SourceMgr` есть свой id (`unsigned int`).
Зная id буфера можно будет спокойно открыть его и читать.

## Реализация первых объектов

Давайте уже напишем что-нибудь. Вернемся к временным объектам диагностики. Помимо кода ошибки (`enum class`), сообщения и позиции, этот объект ещё хранит
некоторую полезную информацию. Например, `Span`. `Span` --- объект, который показывает, какая часть строки стала ошибкой. Проще говоря это подчеркивание
куска кода, который выдал ошибку. `Span` помимо такого подчеркивания может хранить сообщение, которое будет отрисовываться рядом с подчеркиванием (в контексте
Veo `Span` --- просто подчеркивание, а вот сообщение и `Span` хранит структура `Annotation`). Помимо `Span` будет полезным хранить информацию о помощи (notes).
Это просто строки.

```cpp
$#pragma once
$#include <llvm/Support/SMLoc.h>
$
$namespace veo::diagnostic {
$
struct Span {
    llvm::SMLoc Start;
    llvm::SMLoc End;

    Span (llvm::SMLoc start, llvm::SMLoc end) : Start (start), End (end) {}

    bool
    operator== (const Span &other) const {
        if (this == &other) {
            return true;
        }

        return Start == other.Start && End == other.End;
    }
};
$
$}
```

```cpp
$#pragma once
$#include <cstdint>
$
$namespace veo::diagnostic {
$
enum class Severity : uint8_t { Error, Warning, Note, Help };

enum class DiagCode : uint8_t {
    EUnexpectedToken,
    EExpectedStmt,
    EExpectedExpr,
    // ...

    WUnusedVar,
    WLossPrecision,
};
$
$}
```

```cpp
$#pragma once
$#include <diagnostic/span.h>
$#include <string>
$#include <utility>
$
$namespace veo::diagnostic {
$
struct Annotation {
    struct Span Span; // `struct` нужен потому что 
                      // поле называется так же, как и тип...
                      // Ненавижу C++ >(
    std::string Label;
    bool        IsPrimary = true;

    Annotation (struct Span span, std::string label, bool isPrimary)
        : Span (span), Label (std::move (label)), IsPrimary (isPrimary) {}

    bool
    operator== (const Annotation &other) const {
        if (this == &other) {
            return true;
        }

        return Span == other.Span && Label == other.Label && IsPrimary == other.IsPrimary;
    }
};
$
$}
```

```cpp
$#pragma once
$#include <string>
$#include <vector>
$
$namespace veo::diagnostic {
$
struct Note {
    std::string              Label;
};
$
$}
```

`Note` в этой книге немного урезан. Поначалу в Veo `Note` выглядел именно так, как я показал выше. Однако по мере разработки мне было необходимо решить одну
задачу. Представьте ситуацию: вы вызываете функцию, а компилятор не может найти её кандидата. Тогда появляется ошибка о том, что кандидат функции не найден.
Я захотел в заметки выводить информацию о том, какие кандидаты функции доступны и нужно было как-то выводить эту информацию вот в таком виде:

```bash
@error[E0016]: no matching function for call to 'max'
@  --> src/main.veo:2:12
@   |
@ 2 |     return max(2.0, 3.0);
@   |            ^^^^^^^^^^^^^
@   |
   = note: candidate functions found:
           func max(i32, i32): i32
```

Самое главное: чтобы `func ...` был на том же уровне, что и сообщение. Для этого я ввел некий, как мне кажется, костыль: новое поле в `Note`. Сейчас в Veo эта
структура выглядит так:

```cpp
$#pragma once
$#include <string>
$#include <vector>
$
$namespace veo::diagnostic {
$
struct Note {
    std::string              Label;
    std::vector<std::string> Elements;
};
$
$}
```

И везде, где фигурирует `Note`, это новое поле учитывается. Для простоты эта книга не будет учитывать это поле из-за ненадобности.

Что означает `isPrimary`? Всё просто. Я поставил себе задачу: выводить ошибки, предоставляя максимально много информации. В связи с этим подчеркивание может быть
двух видов: основное (где ошибка произошла, то самое поле `isPrimary`) и второстепенное (что могло привести к ошибке). Можно ли делать без этого разделения?
Можно. Давайте посмотрим, как бы выглядела одна и та же ошибка с этим разделением и без:

```veo
let x = 10;
let x = 5; // переопределение 'x'
```

Без разделения:

```bash
error[E0013]: variable 'x' is already defined
  --> src/main.veo:1:5
   |
 2 | let x = 5;
   |     ^ redefined here
   |
```

С разделением:

```bash
error[E0013]: variable 'x' is already defined
  --> src/main.veo:1:5
   |
 1 | let x = 10;
   |     - previous definition was here
 2 | let x = 5;
   |     ^ redefined here
   |
```

Вы можете оставить первый вариант. Я даже рекомендую оставить более простой вариант, ведь вы только учитесь.

Это всё лишь вспомогательные структуры, дальше идет сам объект, представляющий ошибки. В Veo называется `DiagnosticBuilder` и предоставляет методы, которые
наслаивают на него `Annotation`, `Note`, и методы, которые дают эту информацию.

```cpp
$#pragma once
$#include <diagnostic/annotation.h>
$#include <diagnostic/codes.h>
$#include <diagnostic/note.h>
$#include <utility>
$#include <vector>
$
$namespace veo::diagnostic {
$
class DiagnosticBuilder {
    DiagCode                _code;
    std::string             _message;
    Severity                _severity;
    std::vector<Annotation> _spans;
    std::vector<Note>       _notes;

public:
    DiagnosticBuilder (DiagCode code, std::string message, Severity severity)
        : _code (code), _message (std::move (message)), _severity (severity) {}

    DiagnosticBuilder &
    AddSpan (Span span, std::string label = "", bool isPrimary = true) {
        _spans.emplace_back (span, std::move (label), isPrimary);
        return *this;
    }

    DiagnosticBuilder &
    AddSpan (
        llvm::SMLoc start,
        llvm::SMLoc end,
        std::string label     = "",
        bool        isPrimary = true) {
        return AddSpan (Span (start, end), std::move (label), isPrimary);
    }

    DiagnosticBuilder &
    AddNote (std::string text) {
        _notes.emplace_back (std::move (text));
        return *this;
    }

    DiagCode
    Code () const {
        return _code;
    }

    const std::string &
    Message () {
        return _message;
    }

    Severity
    GetSeverity () const {
        return _severity;
    }

    std::vector<Annotation> &
    Spans () {
        return _spans;
    }

    const std::vector<Note> &
    Notes () {
        return _notes;
    }
};
$
$}
```

Благодаря тому, что методы `AddSpan` и `AddNote` возвращают ссылку на себя же, можно писать такие цепочки:

```cpp
// !псевдокод!
builder
    .AddSpan(start, end)
    .AddSpan(start2, end2, /*isPrimary:*/false)
    .AddNote("i hate C++ :>");
```

Но эти билдеры кто-то должен добавлять в движок. Да было бы неплохо написать сам движок. Он должен хранить в себе эти `DiagnosticBuilder`, а также менеджер
ресурсов (`llvm::SourceMgr`), чтобы просто получить имя файла и строка:столбец.

```cpp
$#pragma once
$#include <diagnostic/builder.h>
$#include <diagnostic/codes.h>
$#include <llvm/Support/SourceMgr.h>
$#include <llvm/Support/raw_ostream.h>
$
$namespace veo::diagnostic {
$
class DiagnosticEngine {
    llvm::SourceMgr               *_mgr;
    std::vector<DiagnosticBuilder> _builders;
    bool                           _hasErrs{};

public:
    explicit DiagnosticEngine (llvm::SourceMgr &mgr) : _mgr (&mgr) {}

    DiagnosticBuilder &
    Report (DiagCode code, std::string message, Severity severity) {
        _builders.emplace_back (code, std::move (message), severity);
        if (severity == Severity::Error) {
            _hasErrs = true;
        }
        return _builders.back ();
    }

    bool
    HasErrors () const {
        return _hasErrs;
    }

    void
    Render () {
        int i = 0;
        for (DiagnosticBuilder &diag : _builders) {
            renderDiag (diag);
            if (i != 0) {
                llvm::errs () << '\n';
            }
            ++i;
        }
    }

    std::vector<DiagnosticBuilder> &
    Builders () {
        return _builders;
    }

private:
    void
    renderDiag (DiagnosticBuilder &diag);

    void
    printDiagnosticHeader (DiagnosticBuilder &diag);

    void
    printDiagnosticBody (DiagnosticBuilder &diag);
};
$
$}
```

Именно метод `Report` создает и добавляет `DiagnosticBuilder`. Получается, что цепочка будет выглядеть примерно так:

```cpp
// !псевдокод!
$llvm::SourceMgr mgr;
$DiagnosticEngine diag (mgr);
$llvm::SMLoc start;
$llvm::SMLoc end;
$
diag
    .Report (DiagCode::EUnexpectedToken, "expected ';'", Severity::Error)
    .AddSpan (start, end);
```

Метод `renderDiag` выводит весь `DiagnosticBuilder` в `stderr`. Метод `printDiagnosticHeader` выводит лишь заголовок `DiagnosticBuilder`:

```bash
error[E0013]: variable 'x' is already defined
  --> src/main.veo:1:5
```

А `printDiagnosticBody` выводит уже всё остальное:

```bash
   |
 1 | let x = 10;
   |     - previous definition was here
 2 | let x = 5;
   |     ^ redefined here
   |
```

Я сделал так, потому что хотел разбить логику в две функции и не нагружать `renderDiag`, иначе последний превратился бы в нечитабельное месиво из символов.

## Подготовка перед рендером

Перед тем как рисовать ошибки нужно их отсортировать. Проблема в том, что мы можем сначала добавить `Span`, который подсвечивает что-то на 5-ой строке, а потом
добавить `Span`, который подсвечивает что-то на 10-ой строке. Тогда рендер правильно отрисует всё (сначала 5-ую строку, затем 10-ую). Но как только мы поменяем
порядок создания (сначала добавим `Span` от 10-ой строки, а затем от 5-ой), то движок выведет их в том порядке, в котором мы добавили `Span`-ы (сначала
подсветит 10-ую строку, а только потом 5-ую). Это неправильно поведение и нам сначала нужно отсортировать все `DiagnosticBuilder`-ы, которые записались в движок,
чтобы потом корректно выводить их.

```cpp
$#include <algorithm>
$#include <cmath>
$#include <diagnostic/builder.h>
$#include <diagnostic/codes.h>
$#include <diagnostic/engine.h>
$#include <format>
$#include <llvm/Support/raw_ostream.h>
$
$namespace veo::diagnostic {
$
void
DiagnosticEngine::renderDiag (DiagnosticBuilder &diag) {
    auto buff = _mgr
    std::ranges::sort (diag.Spans (), [&] (const Annotation &a, const Annotation &b) {
        unsigned buffer = _mgr->FindBufferContainingLoc (a.Span.Start);
        return _mgr->getLineAndColumn (a.Span.Start, buffer).first
               < _mgr->getLineAndColumn (b.Span.Start, buffer).first;
    });
    printDiagnosticHeader (diag);
    printDiagnosticBody (diag);
}
$
$}
```

Метод `FindBufferContainingLoc` из `llvm::SourceMgr` ищет id буфера, зная лишь `llvm::SMLoc`.
Метод `getLineAndColumn` из `llvm::SourceMgr` как раз просчитывает строку и столбец и возвращает `std::pair<unsigned, unsigned` (пару строка:столбец).
Затем выводится заголовок и тело билдера.

```cpp
$#include <algorithm>
$#include <cmath>
$#include <diagnostic/builder.h>
$#include <diagnostic/codes.h>
$#include <diagnostic/engine.h>
$#include <format>
$#include <llvm/Support/raw_ostream.h>
$
$namespace veo::diagnostic {
$
$std::string
$SeverityToString (Severity severity) {
$#define func_case(expr, res)                                                             \
$    case Severity::expr: return res;
$
$    switch (severity) {
$        func_case (Error, "error");
$        func_case (Warning, "warning");
$        func_case (Note, "note");
$        func_case (Help, "help");
$    }
$
$#undef func_case
$
$    return "error";
$}
$
$char
$SeverityToPrefix (Severity severity) {
$    return (char) toupper (SeverityToString (severity)[0]);
$}
$
$llvm::raw_fd_ostream::Colors
$SeverityToColor (Severity severity) {
$#define func_case(expr, col)                                                             \
$    case Severity::expr: return llvm::raw_fd_ostream::col;
$
$    switch (severity) {
$        func_case (Error, RED);
$        func_case (Warning, YELLOW);
$        func_case (Note, WHITE);
$        func_case (Help, CYAN);
$    }
$
$#undef func_case
$
$    return llvm::raw_fd_ostream::WHITE;
$}
$
$int
$DiagCodeToIntegerCode (DiagCode code) {
$    if (code <= errCodeLast) {
$        return static_cast<int> (code);
$    }
$    if (code <= warnCodeLast) {
$        return static_cast<int> (
$            static_cast<uint8_t> (code) - static_cast<uint8_t> (warnCodeStart));
$    }
$    return 0;
$}
$
void
DiagnosticEngine::printDiagnosticHeader (DiagnosticBuilder &diag) {
    llvm::errs ().changeColor (SeverityToColor (diag.GetSeverity ()), true);

    llvm::errs () << SeverityToString (diag.GetSeverity ()) << llvm::raw_fd_ostream::WHITE
                  << '[';
    llvm::errs ().changeColor (SeverityToColor (diag.GetSeverity ()), true);
    std::string errCode = std::format ("{:04}", DiagCodeToIntegerCode (diag.Code ()));
    llvm::errs () << SeverityToPrefix (diag.GetSeverity ()) << errCode
                  << llvm::raw_fd_ostream::WHITE << "]: " << diag.Message () << '\n';
}
$
$}
```

Выглядит сложно, я понимаю. Сейчас всё объясню! `llvm::errs ()` --- LLVM обертка над потоком вывода в `stderr`, тут всё очень похоже на `std::cerr`.
Также есть `llvm::outs ()` --- это уже аналог `stdout`. Я выбрал эти аналоги, потому что они легковесны, по сравнению с C++ версиями.
Метод `changeColor` меняет цвет, причем имеет необязательные поля, например, `Bold` (второе поле), которое по умолчанию равно `false`.
`llvm::raw_fd_ostream` --- поток вывода в файловый дескриптор, который также имеет цвета (например, WHITE), которые меняют цвет в выводе, тут все логично.
Выглядит странно и костыльно, в прочем вы можете сделать эту часть гораздо лучше и приятнее.

Теперь самое сложное: вывод тела.

```cpp
$#include <algorithm>
$#include <cmath>
$#include <diagnostic/builder.h>
$#include <diagnostic/codes.h>
$#include <diagnostic/engine.h>
$#include <format>
$#include <llvm/Support/raw_ostream.h>
$
$namespace veo::diagnostic {
$
$int
$DigitCount (int line) {
$    if (line == 0) {
$        return 1;
$    }
$    return static_cast<int> (std::log10 (line)) + 1;
$}
$
void
DiagnosticEngine::printDiagnosticBody (DiagnosticBuilder &diag) {
    int         maxLineWidth = 1;
    std::string lastBufferId;
    for (const auto &span : diag.Spans ()) {
        unsigned           buffer = _mgr->FindBufferContainingLoc (span.Span.Start);
        const std::string &bufferId
            = _mgr->getBufferInfo (buffer).Buffer->getBufferIdentifier ().str ();
        const char *bufferStart = _mgr->getBufferInfo (buffer).Buffer->getBufferStart ();
        const char *bufferEnd   = _mgr->getBufferInfo (buffer).Buffer->getBufferEnd ();
        auto        lineAndCol  = _mgr->getLineAndColumn (span.Span.Start, buffer);
        int         maxLine     = static_cast<int> (
            _mgr->getLineAndColumn (diag.Spans ().back ().Span.Start, buffer).first);
        maxLineWidth = DigitCount (maxLine);

        if (span == diag.Spans ().front ()
            || !lastBufferId.empty () && lastBufferId != bufferId) {
            if (span != diag.Spans ().front ()) {
                llvm::errs () << '\n';
            }
            llvm::errs ().changeColor (llvm::raw_fd_ostream::WHITE);
            llvm::errs () << std::string (maxLineWidth, ' ') << " --> " << bufferId << ':'
                          << lineAndCol.first << ':' << lineAndCol.second << '\n';
            lastBufferId = bufferId;
        }

        if (span == diag.Spans ().front ()) {
            llvm::errs ().changeColor (llvm::raw_fd_ostream::WHITE, true);
            llvm::errs () << std::string (maxLineWidth, ' ') << "  |\n";
        }

        llvm::errs ().changeColor (llvm::raw_fd_ostream::YELLOW, true)
            << std::format (" {:{}} ", lineAndCol.first, maxLineWidth);
        llvm::errs ().changeColor (llvm::raw_fd_ostream::WHITE, true) << "| ";

        const char *lineStart = span.Span.Start.getPointer ();
        const char *lineEnd   = lineStart;
        for (; *(lineStart - 1) != '\n' && lineStart > bufferStart; --lineStart) {
        }
        for (; *lineEnd != '\n' && lineEnd <= bufferEnd; ++lineEnd) {
        }
        llvm::errs () << std::string (lineStart, lineEnd - lineStart) << '\n';

        llvm::errs () << std::string (maxLineWidth, ' ') << "  | ";
        llvm::errs () << std::string (span.Span.Start.getPointer () - lineStart, ' ');
        char underlineSymbol = span.IsPrimary ? '^' : '-';
        llvm::errs ().changeColor (llvm::raw_fd_ostream::RED, true) << std::string (
            std::min (
                span.Span.End.getPointer () - span.Span.Start.getPointer (),
                lineEnd - lineStart),
            underlineSymbol);
        llvm::errs ().changeColor (llvm::raw_fd_ostream::WHITE, true);
        if (!span.Label.empty ()) {
            llvm::errs () << ' ' << span.Label;
        }
        llvm::errs () << '\n';

        if (span == diag.Spans ().back ()) {
            llvm::errs () << std::string (maxLineWidth, ' ') << "  |\n"
                          << llvm::raw_fd_ostream::RESET;
        }
    }

    for (const auto &[label, els] : diag.Notes ()) {
        llvm::errs ().changeColor (llvm::raw_fd_ostream::CYAN, true)
            << std::string (maxLineWidth, ' ') << "  = note: ";
        llvm::errs () << llvm::raw_fd_ostream::RESET << label << '\n';
        for (const auto &el : els) {
            llvm::errs ()
                    << std::string (
                        maxLineWidth + sizeof ("  = note: ") - 1, // -1, потому что sizeof учитывает '\0',
                                                                  // а нам нужно его выкинуть
                        ' '
                    );
            llvm::errs () << llvm::raw_fd_ostream::RESET << el << '\n';
        }
    }
}
$
$}
```

Главная задача --- отрисовать строку с ошибкой. Эту строку как минимум нужно найти, и чтобы это сделать нам нужно хотя бы получить указатели на символы из файла.
Для этого используется метод `getPointer` из `llvm::SMLoc`. Как только мы получим указатели на начало и конец `Span`-а, мы сможем смещать указатели, чтобы найти
границы строки. Но перед тем как вывести эту строку, нам нужно отрисовать номер строки и разделитель `|`. Теперь представьте ситуацию: компилятор нашел ошибки
на 5-ой, 500-ой и 50000-ой строках. Возникает проблема с разделителем `|`, ведь его надо смещать на длину числа. Нужна функция для просчета длины числа, и в Veo
эту роль играет функция `DigitCount`. Осталось лишь найти максимальную длину строки и использовать эту длину как основу для вывода разделителей `|`, чтобы
весь вывод был как по линейке:

```veo
let x = 1;
// ...
let x = 5;     // 5-ая строка
// ...
let x = 500;   // 500-ая строка
// ...
let x = 50000; // 50000-ая строка
```

```bash
error[E0013]: variable 'x' is already defined
  --> src/main.veo:1:5
   |
 1 | let x = 1;
   |     - previous definition was here
 5 | let x = 5;
   |     ^ redefined here
   |
error[E0013]: variable 'x' is already defined
   --> src/main.veo:1:5
    |
  1 | let x = 1;
    |     - previous definition was here
 50 | let x = 50;
    |     ^ redefined here
    |

error[E0013]: variable 'x' is already defined
    --> src/main.veo:1:5
     |
   1 | let x = 1;
     |     - previous definition was here
 500 | let x = 500;
     |     ^ redefined here
     |

error[E0013]: variable 'x' is already defined
      --> src/main.veo:1:5
       |
     1 | let x = 1;
       |     - previous definition was here
 50000 | let x = 50000;
       |     ^ redefined here
       |
```

Вот как это должно выглядеть.

На этом диагностика заканчивается. Чтобы ей пользоваться она должна жить столько же, сколько живет программа, поэтому её надо передавать по ссылке.

## Пример использования

Давайте я возьму какой-нибудь пример из самого Veo:

```cpp
$// любопытная варвара 🙄. О парсере позже!
$bool
$Parser::expectSemi () {
$    if (!match (TokenKind::Semi)) {
        _diag
            .Report (
                DiagCode::EUnexpectedToken,
                "expected ';', found '" + _curTok.Val + "'",
                Severity::Error)
            .AddSpan (_curTok.Start, _curTok.End, "expected ';'");
$        synchronize ();
$        return false;
$    }
$    return true;
$}
```

Если вкратце, то этот пример создает ошибку о том, что ожидалась `;`, но получился другой токен.
Пример контекста с кодом:

```veo
func main(): i32 {
    let x = 10
    return 0;
}
```

```bash
error[E0000]: expected ';', found 'return'
  --> src/main.veo:3:5
   |
 3 |     return 0;
   |     ^^^^^^ expected ';'
   |
```
