import esbuild from "esbuild";
import { builtinModules } from "node:module";
import { copyFileSync, mkdirSync, existsSync, watch as watchFile } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = dirname(fileURLToPath(import.meta.url));
const isProd = process.argv[2] === "production";

/**
 * Собираем в корень репозитория: именно эти три файла — main.js, manifest.json
 * и styles.css — Obsidian и ждёт в папке плагина, и они же уходят в релиз.
 */
const outDir = root;

/**
 * Заодно кладём сборку в хранилище для проверки, чтобы после правки хватало
 * одного Reload. Путь задаётся переменной OXILL_FORMS_VAULT; без неё пробуем соседний
 * test-vault. Копируем, только если папка плагинов там уже есть: у чужого
 * клона хранилища нет, и создавать что-то рядом с чужим проектом нельзя.
 */
const VAULT_PLUGIN_DIR =
    process.env.OXILL_FORMS_VAULT ??
    join(root, "..", "test-vault", ".obsidian", "plugins", "oxill-forms");

function vaultDir() {
    return existsSync(dirname(VAULT_PLUGIN_DIR)) ? VAULT_PLUGIN_DIR : null;
}

const STATIC_FILES = ["manifest.json", "styles.css"];

/** manifest.json и styles.css esbuild не трогает — копируем руками на каждой сборке. */
function copyStatics() {
    const vault = vaultDir();
    if (!vault) return;

    mkdirSync(vault, { recursive: true });
    for (const file of [...STATIC_FILES, "main.js"]) {
        const from = join(root, file);
        if (existsSync(from)) copyFileSync(from, join(vault, file));
    }
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
                const vault = vaultDir();
                console.log(`[${stamp}] OK -> ${outDir}${vault ? ` (+ vault)` : ""}`);
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
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
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
                console.log(`[${stamp}] statics copied`);
            }, 50);
        });
    }

    console.log("watch mode. Edit src/ or styles.css, then Ctrl+P -> Reload app in Obsidian.");
}
