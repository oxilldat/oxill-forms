import esbuild from "esbuild";
import builtins from "builtin-modules";
import { copyFileSync, mkdirSync, existsSync, watch as watchFile } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = dirname(fileURLToPath(import.meta.url));
const isProd = process.argv[2] === "production";

/** Плагин ставится прямо в тестовое хранилище — правки видно сразу после Reload. */
const VAULT_PLUGIN_DIR = join(
    root,
    "..",
    "test-vault",
    ".obsidian",
    "plugins",
    "modal-forms-lite",
);

/**
 * Собираем всегда в хранилище — и в watch, и в production. Так плагин там
 * никогда не отстаёт от исходников. Production дополнительно кладёт копию
 * в корень проекта: это то, что уходит в релиз.
 */
const outDir = VAULT_PLUGIN_DIR;
mkdirSync(outDir, { recursive: true });

const STATIC_FILES = ["manifest.json", "styles.css"];

/** manifest.json и styles.css esbuild не трогает — копируем руками на каждой сборке. */
function copyStatics() {
    for (const file of STATIC_FILES) {
        const from = join(root, file);
        if (existsSync(from)) copyFileSync(from, join(outDir, file));
    }
    if (isProd) copyFileSync(join(outDir, "main.js"), join(root, "main.js"));
}

const notifyPlugin = {
    name: "notify",
    setup(build) {
        build.onEnd((result) => {
            copyStatics();
            // Только ASCII: вывод перенаправляется в файл, а консоль Windows
            // отдаёт кириллицу в cp866 и лог становится нечитаемым.
            const stamp = new Date().toLocaleTimeString("ru-RU");
            if (result.errors.length) {
                console.log(`[${stamp}] FAILED: ${result.errors.length} error(s)`);
            } else {
                console.log(`[${stamp}] OK -> ${outDir}`);
            }
        });
    },
};

const context = await esbuild.context({
    entryPoints: [join(root, "src", "main.ts")],
    bundle: true,
    external: [
        "obsidian",
        "electron",
        "@codemirror/autocomplete",
        "@codemirror/collab",
        "@codemirror/commands",
        "@codemirror/language",
        "@codemirror/lint",
        "@codemirror/search",
        "@codemirror/state",
        "@codemirror/view",
        "@lezer/common",
        "@lezer/highlight",
        "@lezer/lr",
        ...builtins,
    ],
    format: "cjs",
    target: "es2022",
    // Иначе esbuild экранирует кириллицу в \uXXXX и бандл нечитаем при отладке.
    charset: "utf8",
    logLevel: "info",
    sourcemap: isProd ? false : "inline",
    treeShaking: true,
    outfile: join(outDir, "main.js"),
    minify: isProd,
    plugins: [notifyPlugin],
});

if (isProd) {
    await context.rebuild();
    await context.dispose();
} else {
    await context.watch();

    // esbuild следит только за модулями, попавшими в бандл. styles.css и
    // manifest.json в него не входят, поэтому watch на них — отдельный.
    let pending = null;
    for (const file of STATIC_FILES) {
        const path = join(root, file);
        if (!existsSync(path)) continue;
        watchFile(path, () => {
            // fs.watch на Windows шлёт по несколько событий на одно сохранение.
            clearTimeout(pending);
            pending = setTimeout(() => {
                copyStatics();
                const stamp = new Date().toLocaleTimeString("ru-RU");
                console.log(`[${stamp}] statics copied -> ${outDir}`);
            }, 50);
        });
    }

    console.log("watch mode. Edit src/ or styles.css, then Ctrl+P -> Reload app in Obsidian.");
}
