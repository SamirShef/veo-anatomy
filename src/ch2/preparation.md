# Подготовка

---

Начало: 27.05.2026, 11:09:04\
Конец: 27.05.2026, 11:37:40

---

Итак, мы уже готовы разрабатывать компилятор. С чего бы начать? Лично я бы начал с создания нового репозитория на GitHub и его клонирования на свой ПК.
Затем я бы создал базовую структуру проекта (директории `include/` и `src/`) и написал бы точку входа `main.cpp`:

```cpp
#include <iostream>

int
main (int argc, char **argv) {
    std::cout << "Hello Veo!\n";
    return 0;
}
```

Затем нужно написать `CMakeLists.txt`, чтобы собирать проект. Скрипт должен находить LLVM на машине пользователя и линковать его с `veoc-core`, а затем
линковать саму библиотеку `veoc-core` с точкой входа (`main.cpp`), чтобы получить исполняемый файл `veoc`. Вот пример моего `CMakeLists.txt`:

```cmake
cmake_minimum_required(VERSION 3.20)
project(veoc LANGUAGES CXX C)

# Установка стандартов и специальных флагов
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Находим LLVM и выводим сообщения о том, где он находится
find_package(LLVM REQUIRED CONFIG)
message(STATUS "LLVM ${LLVM_PACKAGE_VERSION} was found")
message(STATUS "LLVM path: ${LLVM_DIR}")

# Включаем директории LLVM для доступа к его заголовкам
include_directories(SYSTEM ${LLVM_INCLUDE_DIRS})
add_definitions(${LLVM_DEFINITIONS})

# Флаги для корректного использования LLVM
if(NOT LLVM_ENABLE_RTTI)
    if(MSVC)
        add_compile_options(/GR-)
    else()
        add_compile_options(-fno-rtti)
    endif()
endif()
if(NOT LLVM_ENABLE_EH)
    if(MSVC)
        add_compile_options(/EHs- /EHc-)
    else()
        add_compile_options(-fno-exceptions)
    endif()
endif()

# LLVM может распространяться как динамическая, так и статическая библиотека
# И это проблема, ведь способы линковки у них отличаются
if(TARGET LLVM)
    # Нашлась динамическая библиотека
    set(LLVM_LINK_LIBS LLVM) # Сохраняем библиотеки в нашу
                             # переменную LLVM_LINK_LIBS
    message(STATUS "Using shared LLVM target") # Уведомляем, что нашли динамическую
                                               # библиотеку
else()
    # Нашлась статическая библиотека
    # Для нахождения модулей LLVM используем макрос от разработчиков LLVM
    # и сохраняем все модули в ту же переменную LLVM_LINK_LIBS
    llvm_map_components_to_libnames(
        LLVM_LINK_LIBS
        core
        support
        analysis
        target
        mc
        bitreader
        passes
        codegen
        asmparser
        asmprinter
        ${LLVM_TARGETS_TO_BUILD}
    )
    message(STATUS "Using static LLVM components: ${LLVM_LINK_LIBS}")
endif()

# Рекурсивный поиск всех .cpp файлов в src/
file(GLOB_RECURSE SOURCES "src/*.cpp")
# Исключаем файл main.cpp с помощью регулярных выражений. Помните,
# что точка входа не должна быть частью veoc-core!
list(FILTER SOURCES EXCLUDE REGEX ".*/main\\.cpp$|main\\.cpp$")

# Создание статической библиотеки veoc-core
add_library(veoc-core STATIC ${SOURCES})

# Флаги для совместимости с LLVM и отладки
target_compile_options(veoc-core PRIVATE -fno-rtti -fno-exceptions -g)
# Линковка LLVM
target_link_libraries(veoc-core PRIVATE
    ${LLVM_LINK_LIBS}   # Наша переменная
    ${LLVM_SYSTEM_LIBS} # Дополнительные части LLVM
)
# Добавление директории include/ к veoc-core
target_include_directories(veoc-core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)

# Создание главного бинарника — veoc
add_executable(
    ${PROJECT_NAME} # veoc
    ${CMAKE_CURRENT_SOURCE_DIR}/src/main.cpp
)
# Линковка veoc-core с veoc
target_link_libraries(${PROJECT_NAME} PRIVATE veoc-core)
```

Я уверен, что мой `CMakeLists.txt`, если не идеален, то ужасен. Я всегда рад критике и приму любую вашу помощь в поддержке проекта. Этот скрипт (с некоторыми
дополнениями) используется в самом Veo для сборки. На будущее: настоятельно рекомендую размещать все части компилятора по пространствам имён (или модулям, зависит
от языка, на котором вы пишете). Каркас готов, осталось наслаивать мясо!
