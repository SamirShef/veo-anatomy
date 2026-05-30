# Лексический анализ

---

Начало: 30.05.2026, 10:06:11\
Конец: -

---

## Файл

Что такое файл? Мы не будем обращать внимание на атрибуты, права доступа и всё такое. Файл --- текст, сохраненный на накопитель (HDD, SSD, не важно). Файлы имеют
имя, расширение. Некоторым может показаться, что расширение --- что-то магическое, что меняет смысл файла. Расширение --- всего лишь маркер для программы,
чтобы она понимала с чем имеет дело. Расширение нужно лишь для того, чтобы стандартизировать содержимое файла. Это нужно для программ, которые эти файлы
принимают (например, `gcc` не может скомпилировать `C` код, сохраненный в, например `.q` расширение, потому что `gcc` не знает ничего о `.q` и не может
быть уверен, что там код на `C`). Все файлы --- текст, который можно сохранить в строку и дальше анализировать её.

## Токены

Языки программирования, обычно, не зависят от стиля. Это значит, что, например, такой код на `C++`:

```cpp
int
x     =         
        10;

int
main () {
    return 0;
}
```

Корректно скомпилируется. Обилие невидимых символов и комментариев не несет никакой смысловой нагрузки, поэтому их нужно пропускать, а заодно и сохранять
то, что реально несет нагрузку. И как раз таки то, что несет нагрузку, называется ***токен***. Токен (или же лексема) в контексте
компиляторов --- минимальная неделимая единица исходного кода, имеющая самостоятельный смысл. Это может быть ключевое слово
(например, `let`, `i32`, `func`, `if` из Veo), идентификатор (например, `x`, `myVar`, `aboba228_cool_name`), литерал
(например, `123`, `"Hello, reader!"`, `'D'`, `true`/`false`) и операторы/спец. символы (например, `=`, `+=`, `@`, `&`). Это первое и самое простое промежуточное
представление в компиляторе. Оно нужно лишь для того, чтобы потом понять, как токены связаны между собой (собирать синтаксис). В модели Veo токены имеют тип,
значение (то, как они выглядят в файле) и позицию (начало и конец):

```cpp
$#pragma once
$#include <cstdint>
$
$namespace veo {
$
enum class TokenKind : uint8_t {
    Id,       // identifier
    Bool,     // type `bool`
    Char,     // type `char`
    I8,       // type `i8`
    Let,      // keyword `let`
    Const,    // keyword `const`
    Func,     // keyword `func`
    Ret,      // keyword `return`
    BoolLit,  // bool literal
    CharLit,  // character literal
    I8Lit,    // i8 literal
    I16Lit,   // i16 literal
    Semi,     // `;`
    Comma,    // `,`
    Dot,      // `.`
    LParen,   // `(`
    Plus,     // `+`
    Minus,    // `-`
    Star,     // `*`

    Unknown,
    Eof
};
$
$}
```

Типов токенов намного больше, чем показано выше. Если вы хотите посмотреть, какие токены есть в Veo, кликайте
[сюда](https://github.com/SamirShef/veolang/blob/main/include/lexer/token_kind.h).

`TokenKind` нужен для того, чтобы быстро понять, какой токен мы будем анализировать (быстро, потому что это число). `TokenKind::Eof` нужен для того, чтобы
пометить конец файла (EOF --- End Of File). `TokenKind::Unknown` нужен для того, чтобы помечать те токены, о которых компилятор не знает. Вот и сам токен:

```cpp
$#pragma once
$#include <lexer/token_kind.h>
$#include <llvm/Support/SMLoc.h>
$#include <string>
$
$namespace veo {
$
struct Token {
    TokenKind   Kind;
    std::string Val;
    llvm::SMLoc Start;
    llvm::SMLoc End;

    Token (TokenKind kind, std::string val, llvm::SMLoc start, llvm::SMLoc end)
        : Kind (kind), Val (std::move (val)), Start (start), End (end) {}
    Token () : Kind (TokenKind::Unknown) {}
};
$
$}
```

## Лексер

Это, конечно, хорошо, что мы сделали базу для составления синтаксиса, но каким образом эти токены создавать? Смысл в том, что мы будем считывать каждый символ из
файла и проверять, какой токен он может создать. Эти правила задаёте вы, но лучше использовать то, что проверено временем. Вот лексические правила Veo:

* **Идентификаторы:** должны начинаться с буквы или знака подчеркивания (`_`), не могут содержать пробелов, спец символов и ключевых слов языка. Регистр имеет
значение.
* **Ключевые слова:** зарезервированные слова, имеющие специальный смысл для компилятора (например, `i32`, `if`, `for`, `return`). Их нельзя
использовать для имен переменных. Регистр имеет значение.
* **Константы:** фиксированные значения, которые не меняются.
  * **Целые** (например: `10`, `-5`, `10u8`, `1_000_000`).
  * **Вещественные** (например: `3.14`, `-0.01`, `10.0f32`).
  * **Символьные** (например: `'A'`, `'\n'`).
  * **Строковые** (например: `"Hello, reader!"`).
  * **Логические** (`true`, `false`).

Именно по этим правилам мы и будем анализировать исходный код. Например, если текущий символ --- буква, то это либо идентификатор, либо ключевое слово, либо
логический литерал. Будем анализировать от худшего --- как будто перед нами идентификатор, потому что для него больше правил. Если в конце анализа идентификатора
окажется, что этот идентификатор --- кейворд, то сохраним токен как кейворд. То же самое и для логических литералов. Если идентификатор не кейворд и не логический
литерал, то сохраним его как кейворд. Или, например, если перед нами `'`, то это 100% символьный литерал. Понимаете смысл? Теперь нужно как-то отразить это
в коде, и заниматься токенизацией будет ***лексер***. Лексеру для счастья нужно знать где начинается начало буфера (начало файла), где он заканчивается (конец
файла) и где в буфере находится "курсор" лексера (символ, который лексер прямо сейчас анализирует). Лексеру не нужно знать всю строку целиком
(глубокое копирование --- фу бяка, его надо избегать), ему хватит указателя на начало и конец буфера, чтобы просто не выходить за его пределы. В Veo лексер
выдает по одному токену по команде. Когда мы будем строить синтаксис нам не важно знать все токены в файле. Нам достаточно будет знать текущий токен, следующий и
последний. Именно поэтому лексер в Veo создает по одному токену за раз, чтобы не занимать лишнюю память (сохранять все токены в `std::vector` и только потом
строить синтаксис). Однако ваш лексер может создавать список токенов, а только потом из них будет строиться синтаксис. Ваш компилятор --- ваши правила.

```cpp
$#pragma once
$#include <diagnostic/engine.h>
$#include <lexer/token.h>
$#include <llvm/Support/SourceMgr.h>
$
$namespace veo {
$
class Lexer {
    const char                   *_bufStart;
    const char                   *_bufEnd;
    const char                   *_curPtr;
    diagnostic::DiagnosticEngine &_diag; // Наш великолепный движок диагностики

public:
    Lexer (diagnostic::DiagnosticEngine &diag, llvm::SourceMgr &mgr, unsigned buffer)
        : _diag (diag) {
        // Получение информации о буфере из llvm::SourceMgr
        const auto &memBuffer = mgr.getMemoryBuffer (buffer);
        // Получение начала буфера и установка курсора в начало
        _curPtr = _bufStart = memBuffer->getBufferStart ();
        // Получение конца буфера
        _bufEnd             = memBuffer->getBufferEnd ();
    }

    Token
    NextToken (); // Запрос на получение нового токена

private:
    Token
    tokenizeId (const char *tokStart); // Токенизация идентификаторов/
                                       // ключевых слов/логических литералов

    Token
    tokenizeNumLit (const char *tokStart); // Токенизация числовых литералов

    Token
    tokenizeStrLit (const char *tokStart); // Токенизация строковых литералов

    Token
    tokenizeCharLit (const char *tokStart); // Токенизация символьных литералов

    Token
    tokenizeOp (const char *tokStart); // Токенизация операторов и спец символов

    void
    skipComments (); // Пропуск комментариев

    TokenKind
    parseNumSuffix (bool isFloat); // Парсинг суффикса числа (если есть)

    char
    peek (int relPos = 0); // Получение символа по смещению (relPos)
                           // Если смещение равно 0, то возвращается текущий
                           // символ
};
$
$}
```

Самый главный метод: `NextToken`. Он смотрит на текущий символ и понимает, как его токенизировать. `tokenizeId`, `tokenizeNumLit`, `tokenizeStrLit`
`tokenizeCharLit`, `tokenizeOp` и `skipComments` --- вспомогательные методы, которые вызываются из `NextToken`.

## NextToken

```cpp
$#include <diagnostic/codes.h>
$#include <lexer/keywords.h>
$#include <lexer/lexer.h>
$#include <llvm/Support/SMLoc.h>
$
$namespace veo {
$
$using namespace diagnostic;
$
#define loc(ptr) llvm::SMLoc::getFromPointer (ptr)

Token
Lexer::NextToken () {
    if (peek () == '/' && (peek (1) == '/' || peek (1) == '*')) {
        skipComments ();
        return NextToken ();
    }
    if (isspace (peek ()) != 0) {
        ++_curPtr;
        return NextToken ();
    }

    if (_curPtr >= _bufEnd) {
        return { TokenKind::Eof, "", loc (_bufEnd), loc (_bufEnd) };
    }
    if ((isalpha (peek ()) != 0) || peek () == '_') {
        return tokenizeId (_curPtr);
    }
    if ((isdigit (peek ()) != 0) || peek () == '.' && (isdigit (peek (1)) != 0)) {
        return tokenizeNumLit (_curPtr);
    }
    if (peek () == '\'') {
        return tokenizeCharLit (_curPtr);
    }
    if (peek () == '"') {
        return tokenizeStrLit (_curPtr);
    }
    return tokenizeOp (_curPtr);
}

// Остальные методы...

#undef loc
$
$}
```

Давайте детально разберем все переходы. Все комментарии нужно пропускать, ведь они не являются токенами. Как только мы пропустим комментарий нужно заново вызвать
`NextToken`, потому что после этого комментария может быть ещё комментарий или пробельные символы, например:

```veo
// comment
// one more

/*
 * and one more
*/
let x = 10;
```

Если мы встречаем пробельный символ то пропускаем его и делаем то же самое (вызываем `NextToken` повторно). Если мы выходим за пределы буфера, то
возвращаем EOF, потому что мы встретили (или уже прошли) конец файла. Если мы встречаем букву или `_`, то это идентификатор (важно, что это проверка именно на
ПЕРВЫЙ символ. Внутри идентификатора могут быть и цифры, но обязательно не на первом месте). Если мы видим цифру или `.`, за которой сразу идет цифра (например,
`.5`, что эквивалентно литералу `0.5`), то это числовой литерал. Если мы видим `'`, то это символьный литерал. Если мы видим `"`, то это строковый литерал.
А если мы не попали ни в одно условие, то это оператор (или неизвестный токен, но этом мы обработаем в `tokenizeOp`). Начнем с простого: метод `peek`:

```cpp
char
Lexer::peek (int relPos) {
    if (_curPtr + relPos < _bufStart || _curPtr + relPos > _bufEnd) {
        return '\0';
    }
    return *(_curPtr + relPos);
}
```

Если мы выходим за пределы буфера, то возвращаем нуль-терминатор (потому что я захотел возвращать именно его). В противном случае вернем символ со смещением.

## Комментарии

Veo поддерживает C-like комментарии, и для их пропуска предназначен метод `skipComments`:

```cpp
void
Lexer::skipComments () {
    _curPtr += 2;
    bool isMultilineComment = peek (-1) == '*';
    if (isMultilineComment) {
        while (peek () != '\0' && (peek () != '*' || peek (1) != '/')) {
            ++_curPtr;
        }
        _curPtr += 2;
    } else {
        while (peek () != '\0' && peek () != '\n') {
            ++_curPtr;
        }
        ++_curPtr;
    }
}
```

Начало комментария всегда состоит из двух символов: `//` или `/*`. По последнему из них можно легко понять тип комментария (однострочный или многострочный).
Зная эту информацию, можно легко пропускать все символы до конца комментария.

## Идентификаторы

```cpp
Token
Lexer::tokenizeId (const char *tokStart) {
    while ((isalnum (peek ()) != 0) || peek () == '_') {
        ++_curPtr;
    }
    std::string val (tokStart, _curPtr - tokStart);

#define tok(kind)                                                                        \
    {                                                                                    \
        kind, val, loc (tokStart), loc (_curPtr)                                         \
    }

    if (const auto &it = keywords.find (val); it != keywords.end ()) {
        return tok (it->second);
    }
    return tok (TokenKind::Id);

#undef tok
}
```

Пока символ удовлетворяет условию нахождения в идентификаторе, мы увеличиваем `_curPtr`. Затем создаем строку с началом в `tokStart` и длиной `_curPtr - tokStart`.
Затем пытаемся найти этот идентификатор в кейвордах, если находим, то это кейворд. Если нет, то идентификатор. Вот и сами кейворды:

```cpp
$#pragma once
$#include <lexer/token_kind.h>
$#include <string>
$#include <unordered_map>
$
$namespace veo {
$
static const std::unordered_map<std::string, TokenKind> keywords{
    { "false",    TokenKind::BoolLit  },
    { "true",     TokenKind::BoolLit  },
    { "let",      TokenKind::Let      },
    { "const",    TokenKind::Const    },
    { "bool",     TokenKind::Bool     },
    { "char",     TokenKind::Char     },
    { "i8",       TokenKind::I8       },
    { "u8",       TokenKind::U8       },
    { "i16",      TokenKind::I16      },
    { "u16",      TokenKind::U16      },
    { "i32",      TokenKind::I32      },
    { "u32",      TokenKind::U32      },
    { "i64",      TokenKind::I64      },
    { "u64",      TokenKind::U64      },
    { "isize",    TokenKind::ISize    },
    { "usize",    TokenKind::USize    },
    { "f32",      TokenKind::F32      },
    { "f64",      TokenKind::F64      },
    { "func",     TokenKind::Func     },
    { "return",   TokenKind::Ret      },
    { "if",       TokenKind::If       },
    { "else",     TokenKind::Else     },
    { "for",      TokenKind::For      },
    { "break",    TokenKind::Break    },
    { "continue", TokenKind::Continue },
    { "struct",   TokenKind::Struct   },
    { "pub",      TokenKind::Pub      },
    { "impl",     TokenKind::Impl     },
    { "trait",    TokenKind::Trait    },
    { "nil",      TokenKind::Nil      },
    { "new",      TokenKind::New      },
    { "del",      TokenKind::Del      },
    { "mod",      TokenKind::Mod      },
    { "import",   TokenKind::Import   },
    { "static",   TokenKind::Static   },
};
$
$}
```

## Строки и символы

Теперь давайте рассмотрим строковые и символьные литералы:

```cpp
Token
Lexer::tokenizeStrLit (const char *tokStart) {
    ++_curPtr;
    while (peek () != '\0' && peek () != '\"') {
        ++_curPtr;
    }
    // Дошли до конца файла, но не нашли закрывающую кавычку
    if (peek () == '\0') {
        _diag
            .Report (
                DiagCode::EUnclosedStrLit,
                "missing terminating '\"' character",
                Severity::Error)
            .AddSpan (loc (tokStart), loc (_curPtr));
    }
    std::string val (tokStart + 1, _curPtr - tokStart - 1);
    ++_curPtr;
    return { TokenKind::StrLit, val, loc (tokStart), loc (_curPtr) };
}
```

Логика создания `val` здесь та же, только мы смещаем начало и конец, чтобы в `val` не попали сами символы `"`. Токенизация символьных литералов будет уже сложнее:

```cpp
Token
Lexer::tokenizeCharLit (const char *tokStart) {
    ++_curPtr;
    unsigned len = 0;
    while (peek () != '\0' && peek () != '\'') {
        ++_curPtr;
        ++len;
    }
    bool unclosed = false;
    if (peek () == '\0') {
        unclosed = true;
        _diag
            .Report (
                DiagCode::EUnclosedCharLit,
                "missing terminating '\'' character",
                Severity::Error)
            .AddSpan (loc (tokStart), loc (_curPtr));
    }
    ++_curPtr;
    if (!unclosed) {
        if (len > 1) {
            _diag
                .Report (
                    DiagCode::EIncorrectCharLitLen,
                    "character literal too long",
                    Severity::Error)
                .AddSpan (loc (tokStart), loc (_curPtr));
        } else if (len == 0) {
            _diag
                .Report (
                    DiagCode::EIncorrectCharLitLen,
                    "empty character literal",
                    Severity::Error)
                .AddSpan (loc (tokStart), loc (_curPtr));
        }
    }
    std::string val (tokStart + 1, _curPtr - tokStart - 1);
    return { TokenKind::CharLit, val, loc (tokStart), loc (_curPtr) };
}
```

Я решил добавить проверки длины символьного литерала прямо во время лексического анализа. Вы можете не делать этого здесь, вместо этого можно проверять длину
в семантике (о ней позже). Также я решил сделать так: если литерал не закрыт, то он по любому слишком длинный, значит сообщения `character literal too long`
лучше не показывать, потому что это очевидно. Поэтому, если литерал не закрыт, то и проверки длины не будет.

## Числа

Теперь самое сложное: числовые литералы. Тут очень много правил и пограничных случаев (все правила присуще именно Veo, вы можете упростить себе правила):

```veo
123
123.45
0.5
.5
1_000_000
1_23.4_5
```

Причем нужно разрешать:

```veo
1.ToString()
```

Символ `_` просто пропускается и не имеет смысловой нагрузки. Но не всегда. `_` может быть началом идентификатора, а значит теоретически может быть такое:

```veo
123._field
```

И здесь `.` уже не принадлежит числу, а является отдельным токеном. Помимо этого Veo поддерживает суффиксы для чисел (суффикс в контексте Veo --- название типа):

```veo
123f64
123_u8
```

Здесь `_` тоже никакой смысловой нагрузки не несет. Нужно ещё учесть, что целочисленные суффиксы нельзя применять к очевидно дробным числам:

```veo
1.0u8 // error
```

Также не мало важный аспект: целые числа плавающей длины. Представьте запись:

```veo
let x = 10;
```

Какой тип у `x`? Мы не указали тип явно, значит надо вывести его из литерала. Компилятор Veo выдаст переменной `x` тип `i32`, потому что `10` имеет такой тип
по умолчанию (целое число без суффиксов). А теперь представим другую ситуацию:

```veo
let x: u8 = 10;
```

Если следовать этому же правилу то мы будем конвертировать тип `i32` (от `10`) в тип `u8` (от `x`), что небезопасно. Да, я знаю, что мы сильно забегаем вперед,
но это необходимая мера, чтобы корректно спроектировать лексер. Чтобы можно было помещать целочисленные литералы без суффиксов, Veo расценивает их как
целочисленные литералы с плавающей длиной. Заранее непонятно, это тип `i32` или какой-то другой. Это выяснится на уровне семантики. Если число без суффикса и
мы не знаем, какой тип ожидаем (как в примере `let x = 10;`, где мы не указали тип для `x`), то по умолчанию даем `10` тип `i32`. Но если мы ожидаем определенный
тип (как в примере `let x: u8 = 10;`), то мы пытаемся понять, а возможно ли это вообще. Например, пример:

```veo
let x: u8 = 257;
```

Не скомпилируется, потому что `257` не помещается в `u8`:

```bash
error[E0008]: literal out of range for 'u8'
  --> src/main.veo:2:17
   |
 2 |     let x: u8 = 257;
   |                 ^^^ value must be in range [0, 255]
   |
```

Однако если всё-таки литерал помещается в тип, то литерал приобретает этот тип. Теперь в примере:

```veo
let x: u8 = 10;
```

Литерал `10` схватит тип `u8` и никаких несоответствий типов не будет. Для дробных чисел такого нет: оно либо `f32` (требуется суффикс), либо `f64` (суффикс не
обязателен).
Для таких плавающих целых чисел был введен отдельный тип токена: `TokenKind::IntLit`, а для чисел с явными суффиксами: `TokenKind::I8Lit`, `TokenKind::U64Lit` и
т. д. для всех типов.

```cpp
Token
Lexer::tokenizeNumLit (const char *tokStart) {
    std::string val;
    bool        isFloat = false;
    if (peek () == '.') {
        val += "0.";
        isFloat = true;
        ++_curPtr;
    }
    while (peek () != '\0'
           && ((isdigit (peek ()) != 0) || peek () == '.' || peek () == '_')) {
        if (peek () == '_') {
            if (isdigit (peek (-1)) == 0) {
                break;
            }
            ++_curPtr;
            continue;
        }
        if (peek () == '.') {
            if (isFloat || isdigit (peek (1)) == 0) {
                break;
            }
            isFloat = true;
        }
        val += *_curPtr++;
    }
    TokenKind kind = parseNumSuffix (isFloat);
    return { kind, val, loc (tokStart), loc (_curPtr) };
}
```

Здесь не получатся трюки в виде `std::string val(tokStart, _curPtr - tokStart`, потому что здесь есть символы `_`, которые нужно опускать.
В этой функции самое главное --- правильно понять смысл точки. Если точка принадлежит числу, то мы её съедаем, в противном случае мы останавливаем цикл и
даём право точке быть самостоятельным токеном. Теперь логика парсинга суффиксов:

```cpp
TokenKind
Lexer::parseNumSuffix (bool isFloat) {
    if (isspace (peek ()) != 0) {
        return isFloat ? TokenKind::F64Lit : TokenKind::IntLit;
    }

    const char *start = _curPtr;
    auto        match = [&] (const char *suffix, int len) {
        // Проверяем полное совпадение суффикса с тем
        for (int i = 0; i < len; ++i) {
            if (suffix[i] != peek (i)) {
                return false;
            }
        }
        // Если сразу после суффикса есть что-то ещё, то это не суффикс
        if (isalnum (peek (len)) != 0 || peek (len) == '_') {
            return false;
        }
        // Пропускаем суффикс
        _curPtr += len;
        return true;
    };
    char first = peek ();

#define kind_macro(val) TokenKind::val##Lit

    // sizeof (str) - 1, потому что sizeof учитывает нуль-терминатор,
    // который мы учитывать не должны
#define match_macro(str, kind)                                                           \
    if (match (str, sizeof (str) - 1)) {                                                 \
        return kind_macro (kind);                                                        \
    }

    // iz и uz --- суффиксы для типов isize и usize соответственно
#define int_group(prefix)                                                                \
    match_macro ("8", prefix##8) match_macro ("16", prefix##16)                          \
        match_macro ("32", prefix##32) match_macro ("64", prefix##64)                    \
            match_macro ("128", prefix##128) match_macro ("z", prefix##Size)

    if (first == 'u') {
        // Целочисленные суффиксы для дробных запрещены
        if (isFloat) {
            _diag
                .Report (
                    DiagCode::EIntSuffixForFloat,
                    "integer suffix cannot be applied to a float",
                    Severity::Error)
                .AddSpan (loc (start), loc (_curPtr));
            return kind_macro (F64);
        }
        ++_curPtr;
        int_group (U);
    } else if (first == 'i') {
        // Целочисленные суффиксы для дробных запрещены
        if (isFloat) {
            _diag
                .Report (
                    DiagCode::EIntSuffixForFloat,
                    "integer suffix cannot be applied to a float",
                    Severity::Error)
                .AddSpan (loc (start), loc (_curPtr));
            return kind_macro (F64);
        }
        ++_curPtr;
        int_group (I);
    } else if (first == 'f') {
        ++_curPtr;
        match_macro ("32", F32) match_macro ("64", F64)
    }
#undef int_group
#undef match_macro
#undef kind_macro

    // Случай, если перед нами не суффикс
    _curPtr = start; // Возврат обратно
    // Если число дробное, то F64Lit, иначе (число --- целое) IntLit (плавающее целое)
    return isFloat ? TokenKind::F64Lit : TokenKind::IntLit;
}
```

Из-за магии макросов это выглядит сложно, но на самом деле эта функция делает не так уж и много. Она читает то, что идёт после числа и проверяет, является ли
то, что она прочитала суффиксом. Если нет, то возвращается назад, как будто ничего не читала, и возвращает значения по умолчанию. Если суффикс найден, то
возвращается `TokenKind` для этого суффикса. А самим чтением занимается лямбда функция `match`, которая возвращает `true`, если она прочитала реальный суффикс,
и `false` в противном случае.

## Операторы

Операторы и спец. символы токенизируются методом `tokenizeOp`. Он самый большой во всем лексере, но только от того, что в нём идёт перебор всех возможных
операторов. Операторы могут быть как односимвольные (`+`, `-`, `!` и т. д.), так и двухсимвольные. Причем последние я разделил на две категории: те, у которых
второй символ --- `=` (`+=`, `==`, `!=` и т. д.) и те, у которых второй символ совпадает с первым (`&&` и `||`).

```cpp
Token
Lexer::tokenizeOp (const char *tokStart) {
#define tok(kind)                                                                        \
    { TokenKind::kind,                                                                   \
      std::string (tokStart, _curPtr - tokStart),                                        \
      loc (tokStart),                                                                    \
      loc (_curPtr) }

    // Односимвольные
#define simple(c, kind)                                                                  \
    case c: {                                                                            \
        return tok (kind);                                                               \
    }

    // Двухсимвольный; на конце --- `=`
#define equal(c, kind)                                                                   \
    case c: {                                                                            \
        if (peek () == '=') {                                                            \
            ++_curPtr;                                                                   \
            return tok (kind##Eq);                                                       \
        }                                                                                \
        return tok (kind);                                                               \
    }

    // Двусимвольный; на конце тот же символ, что и в начале
#define double_op(c, kind1, kind2)                                                       \
    case c: {                                                                            \
        if (peek () == (c)) {                                                            \
            ++_curPtr;                                                                   \
            return tok (kind2);                                                          \
        }                                                                                \
        return tok (kind1);                                                              \
    }

    switch (*_curPtr++) {
        simple (';', Semi);
        simple (',', Comma);
        simple ('.', Dot);
        simple ('(', LParen);
        simple (')', RParen);
        simple ('{', LBrace);
        simple ('}', RBrace);
        simple ('[', LBracket);
        simple (']', RBracket);
        simple ('@', At);
        simple ('~', Tilde);
        simple ('?', Question);
        simple (':', Colon);
        simple ('$', Dollar);
        simple ('^', Carret);
        equal ('=', Eq);
        equal ('!', Bang);
        equal ('>', Gt);
        equal ('<', Lt);
        equal ('+', Plus);
        equal ('-', Minus);
        equal ('*', Star);
        equal ('/', Slash);
        equal ('%', Percent);
        double_op ('&', BitAnd, LogAnd);
        double_op ('|', BitOr, LogOr);
    default: return tok (Unknown);
    }

#undef simple
#undef equal
#undef double_op
#undef tok
}
```

Как можно заметить если оператор не распознан, возвращается `TokenKind::Unknown`.

Лексеры всегда маленькие (лексер Veo уместился в 311 строк), потому что до безумия простые. Можно перенести проверку на длину символьного литерала из лексера в
семантику (как я и говорил до этого), тогда размер ещё уменьшиться. Но мы не гонимся за уменьшением размера, просто важно понимать, что лексер --- это та
подсистема, которая, обычно, небольшая.
