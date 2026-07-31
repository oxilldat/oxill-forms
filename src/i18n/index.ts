import { de } from "./de";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { ru } from "./ru";
import type { TranslationKey } from "./ru";
import { zh } from "./zh";

/**
 * Язык интерфейса плагина.
 *
 * Русский — исходник: на нём строки пишутся, и он же задаёт список ключей
 * (`TranslationKey`). Остальные словари объявлены как `Record<TranslationKey,
 * string>`, поэтому забытый перевод — ошибка сборки, а не пустое место в окне.
 *
 * Модуль намеренно не знает про Obsidian: строки нужны и ядру, где его нет.
 */

export type Locale = "en" | "ru" | "de" | "fr" | "es" | "zh";

const CATALOGS: Record<Locale, Record<TranslationKey, string>> = { en, ru, de, fr, es, zh };

/** Названия языков на них самих: так их узнают, не зная языка настроек. */
export const LANGUAGE_NAMES: Record<Locale, string> = {
    en: "English",
    ru: "Русский",
    de: "Deutsch",
    fr: "Français",
    es: "Español",
    zh: "中文",
};

export function isLocale(value: unknown): value is Locale {
    return typeof value === "string" && value in CATALOGS;
}

/**
 * Язык, с которого плагин начинает жизнь в новом хранилище: смотрим, на чём
 * говорит Obsidian, и берём его, если такой словарь у нас есть. Иначе
 * английский — он есть всегда.
 *
 * Спрашивается это один раз, при установке. Дальше язык живёт в настройках
 * обычным значением: сменил Obsidian язык — плагин своего не меняет, потому
 * что выбор пользователя важнее догадки.
 *
 * Публичного способа узнать язык Obsidian нет, поэтому читаем localStorage,
 * куда он его кладёт, и подстраховываемся языком системы.
 */
export function detectLocale(): Locale {
    let raw = "";
    try {
        raw = window.localStorage.getItem("language") ?? "";
    } catch {
        raw = "";
    }
    if (raw === "") {
        raw = typeof navigator === "undefined" ? "" : (navigator.language ?? "");
    }

    // У Obsidian китайский бывает «zh» и «zh-TW»; нам хватает одного словаря.
    const code = raw.toLowerCase().split(/[-_]/)[0] ?? "";
    return isLocale(code) ? code : "en";
}

let active: Record<TranslationKey, string> = en;

export function setLanguage(locale: Locale): void {
    active = CATALOGS[locale];
}

/**
 * Перевод по ключу. Подстановки в фигурных скобках: `t("greeting", { name })`.
 *
 * Пропущенный ключ отдаём как есть — увидеть его в окне лучше, чем пустоту:
 * так недосмотр находится, а не прячется.
 */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
    const template = active[key] ?? en[key] ?? key;
    if (!params) return template;

    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in params ? String(params[name]) : match,
    );
}

export type { TranslationKey };
