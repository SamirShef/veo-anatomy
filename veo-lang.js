if (typeof hljs !== "undefined") {
    hljs.registerLanguage("veo", function(hljs) {
        return {
            name: "Veo",
            aliases: ['veo'],
            keywords: {
                keyword: "let const func return if else for break continue struct pub trait impl new del mod import static",
                literal: "true false nil",
                built_in: "bool char i8 i16 i32 i64 isize u8 u16 u32 u64 usize f32 f64"
            },
            contains: [
                hljs.C_LINE_COMMENT_MODE,
                hljs.C_BLOCK_COMMENT_MODE,

                hljs.QUOTE_STRING_MODE,
                {
                    className: "string",
                    begin: /'/, end: /'/
                },

                {
                    className: "number",
                    begin: /\b(0x[0-9a-fA-F_]+|0b[01_]+|[0-9_]+(\.[0-9_]+)?)(_?(i8|i16|i32|i64|isize|u8|u16|u32|u64|usize|f32|f64))?\b/
                },

                {
                    beginKeywords: "func",
                    end: /(?=[({])/,
                    contains: [
                        {
                            className: "title.function",
                            begin: /[a-zA-Z_]\w*/
                        }
                    ]
                },

                {
                    beginKeywords: "struct trait",
                    end: /(?=[{])/,
                    contains: [
                        {
                            className: "title.class",
                            begin: /[a-zA-Z_]\w*/
                        }
                    ]
                },

                {
                    className: "title.function.invoke",
                    begin: /[a-zA-Z_]\w*(?=\s*\()/
                },

                {
                    begin: /:\s*/,
                    end: /(?=[,;=\s(){}\[\]])/,
                    contains: [
                        {
                            className: "type",
                            begin: /[a-zA-Z_]\w*(\.[a-zA-Z_]\w*)*/,
                            keywords: {
                                built_in: "bool char i8 u8 i16 u16 i32 u32 i64 u64 isize usize f32 f64"
                            }
                        }
                    ]
                },

                {
                    className: "title.class",
                    begin: /\b[A-Z]\w*\b/
                },

                {
                    className: "operator",
                    begin: /[-+*/%=<>!&|^~?]+/
                }
            ]
        };
    });
}

document.addEventListener("DOMContentLoaded", () => {
    if (typeof hljs === "undefined") {
        return;
    }

    const highlightFn = hljs.highlightElement || hljs.highlightBlock;

    if (typeof highlightFn === "function") {
        setTimeout(() => {
            document.querySelectorAll("pre code.language-veo").forEach((el) => {
                highlightFn(el);
            });
        }, 0);
    }
});

