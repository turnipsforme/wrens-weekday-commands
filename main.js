"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => WeekdayCommandsPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  dailyNotesFolder: ""
};
var obsidianMoment = import_obsidian.moment;
var WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];
var DATE_INPUT_FORMATS = [
  "YYYY-MM-DD",
  "YYYY/MM/DD",
  "YYYY.MM.DD",
  "MMMM D, YYYY",
  "MMMM Do, YYYY",
  "MMM D, YYYY",
  "MMM Do, YYYY",
  "D MMMM YYYY",
  "Do MMMM YYYY",
  "D MMM YYYY",
  "Do MMM YYYY",
  "M/D/YYYY",
  "MM/DD/YYYY",
  "D/M/YYYY",
  "DD/MM/YYYY",
  "MMMM D",
  "MMMM Do",
  "MMM D",
  "MMM Do",
  "D MMMM",
  "Do MMMM",
  "D MMM",
  "Do MMM"
];
var WeekdayCommandsPlugin = class extends import_obsidian.Plugin {
  async onload() {
    await this.loadSettings();
    this.addCommand({
      id: "open-daily-note-by-date",
      name: "Go to daily note by date",
      callback: () => {
        new NaturalLanguageDateModal(this.app, this).open();
      }
    });
    for (const [targetDay, label] of WEEKDAYS.entries()) {
      this.addCommand(this.createWeekdayCommand(targetDay, label));
    }
    this.addSettingTab(new WeekdayCommandsSettingTab(this.app, this));
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  createWeekdayCommand(targetDay, label) {
    return {
      id: `open-next-${label.toLowerCase()}-daily-note`,
      name: `Go to next ${label}`,
      callback: async () => {
        await this.openNextWeekdayNote(targetDay);
      }
    };
  }
  async openNextWeekdayNote(targetDay) {
    const nextDate = this.getNextWeekday(targetDay);
    await this.openDailyNote(nextDate);
  }
  async openDailyNoteFromInput(input) {
    const date = this.parseNaturalDate(input);
    if (!date) {
      new import_obsidian.Notice(`Could not understand date: ${input}`);
      return false;
    }
    await this.openDailyNote(date);
    return true;
  }
  async openDailyNote(date) {
    const dailyNoteSettings = this.getEffectiveDailyNoteSettings();
    const filePath = this.buildNotePath(date.format(dailyNoteSettings.format), dailyNoteSettings.folder);
    const existingFile = this.app.vault.getAbstractFileByPath(filePath);
    if (existingFile instanceof import_obsidian.TFile) {
      await this.openFile(existingFile);
      return;
    }
    if (dailyNoteSettings.useNativeCreation) {
      try {
        const createdFile2 = await this.createDailyNoteLikeCalendar(date, dailyNoteSettings);
        if (createdFile2 instanceof import_obsidian.TFile) {
          await this.openFile(createdFile2);
          return;
        }
      } catch (error) {
        console.error("Weekday Commands: failed to create daily note with Daily Notes template", error);
      }
    }
    await this.ensureFolderExists(dailyNoteSettings.folder);
    await this.app.vault.create(filePath, await this.renderDailyNoteTemplate(date, dailyNoteSettings));
    const createdFile = this.app.vault.getAbstractFileByPath(filePath);
    if (createdFile instanceof import_obsidian.TFile) {
      await this.openFile(createdFile);
      return;
    }
    new import_obsidian.Notice(`Could not open daily note for ${date.format("YYYY-MM-DD")}.`);
  }
  async createDailyNoteLikeCalendar(date, dailyNoteSettings) {
    const filename = date.format(dailyNoteSettings.format);
    const filePath = this.buildNotePath(filename, dailyNoteSettings.folder);
    await this.ensureFolderExists(dailyNoteSettings.folder);
    return this.app.vault.create(filePath, await this.renderDailyNoteTemplate(date, dailyNoteSettings));
  }
  async renderDailyNoteTemplate(date, dailyNoteSettings) {
    const templateContents = await this.getTemplateContents(dailyNoteSettings.template);
    const filename = date.format(dailyNoteSettings.format);
    return templateContents.replace(/{{\s*date\s*}}/gi, filename).replace(/{{\s*time\s*}}/gi, obsidianMoment().format("HH:mm")).replace(/{{\s*title\s*}}/gi, filename).replace(
      /{{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi,
      (_match, _timeOrDate, calc, timeDelta, unit, momentFormat) => {
        const now = obsidianMoment();
        const currentDate = date.clone().set({
          hour: now.get("hour"),
          minute: now.get("minute"),
          second: now.get("second")
        });
        if (calc) {
          currentDate.add(parseInt(timeDelta, 10), unit);
        }
        if (momentFormat) {
          return currentDate.format(momentFormat.substring(1).trim());
        }
        return currentDate.format(dailyNoteSettings.format);
      }
    ).replace(/{{\s*yesterday\s*}}/gi, date.clone().subtract(1, "day").format(dailyNoteSettings.format)).replace(/{{\s*tomorrow\s*}}/gi, date.clone().add(1, "day").format(dailyNoteSettings.format));
  }
  async getTemplateContents(template) {
    if (!template) {
      return "";
    }
    const templatePath = (0, import_obsidian.normalizePath)(template);
    const templateFile = this.app.metadataCache.getFirstLinkpathDest(templatePath, "");
    if (!(templateFile instanceof import_obsidian.TFile)) {
      new import_obsidian.Notice(`Daily note template not found: ${template}`);
      return "";
    }
    return this.app.vault.cachedRead(templateFile);
  }
  async openFile(file) {
    const mode = this.app.vault.getConfig?.("defaultViewMode");
    await this.app.workspace.getUnpinnedLeaf().openFile(file, mode ? { mode } : void 0);
  }
  getNextWeekday(targetDay) {
    const today = obsidianMoment().startOf("day");
    const delta = (targetDay - today.day() + 7) % 7 || 7;
    return today.clone().add(delta, "days");
  }
  parseNaturalDate(input) {
    const query = input.trim().toLowerCase().replace(/\s+/g, " ");
    if (!query) {
      return null;
    }
    const naturalLanguageDatesResult = this.parseWithNaturalLanguageDatesPlugin(input);
    if (naturalLanguageDatesResult) {
      return naturalLanguageDatesResult;
    }
    const today = obsidianMoment().startOf("day");
    const simpleDates = {
      today,
      "right now": today,
      tomorrow: today.clone().add(1, "day"),
      tmr: today.clone().add(1, "day"),
      yesterday: today.clone().subtract(1, "day")
    };
    if (simpleDates[query]) {
      return simpleDates[query].clone();
    }
    const relativeDate = this.parseRelativeDate(query, today);
    if (relativeDate) {
      return relativeDate;
    }
    const namedMonthDate = this.parseNamedMonthDate(query, today);
    if (namedMonthDate) {
      return namedMonthDate;
    }
    const weekdayDate = this.parseWeekdayDate(query, today);
    if (weekdayDate) {
      return weekdayDate;
    }
    const exactDate = obsidianMoment(input.trim(), DATE_INPUT_FORMATS, true);
    if (exactDate.isValid()) {
      return exactDate.startOf("day");
    }
    const looseDate = obsidianMoment(input.trim());
    if (looseDate.isValid()) {
      return looseDate.startOf("day");
    }
    return null;
  }
  parseRelativeDate(query, today) {
    const unitAliases = {
      day: "day",
      days: "day",
      week: "week",
      weeks: "week",
      month: "month",
      months: "month",
      year: "year",
      years: "year"
    };
    const numberPattern = "(a|an|\\d+)";
    const relativeMatch = query.match(new RegExp(`^in ${numberPattern} (${Object.keys(unitAliases).join("|")})$`)) ?? query.match(new RegExp(`^${numberPattern} (${Object.keys(unitAliases).join("|")}) from now$`));
    if (relativeMatch) {
      const amount = this.parseAmount(relativeMatch[1]);
      return today.clone().add(amount, unitAliases[relativeMatch[2]]);
    }
    const agoMatch = query.match(new RegExp(`^${numberPattern} (${Object.keys(unitAliases).join("|")}) ago$`));
    if (agoMatch) {
      const amount = this.parseAmount(agoMatch[1]);
      return today.clone().subtract(amount, unitAliases[agoMatch[2]]);
    }
    const simpleRelativeMatch = query.match(/^(next|last) (week|month|year)$/);
    if (simpleRelativeMatch) {
      const [, direction, unit] = simpleRelativeMatch;
      if (direction === "next" && unit === "week") {
        return today.clone().isoWeekday(8);
      }
      if (direction === "next" && unit === "month") {
        return today.clone().add(1, "month").startOf("month");
      }
      const amount = direction === "next" ? 1 : -1;
      return today.clone().add(amount, unit);
    }
    return null;
  }
  parseNamedMonthDate(query, today) {
    const monthAliases = [
      ...import_obsidian.moment.months().map((monthName2, index) => [monthName2.toLowerCase(), index]),
      ...import_obsidian.moment.monthsShort().map((monthName2, index) => [monthName2.toLowerCase(), index])
    ];
    const monthPattern = monthAliases.map(([monthName2]) => monthName2.replace(".", "\\.")).join("|");
    const monthMatch = query.match(new RegExp(`^(next|mid|middle of|start of|end of) (${monthPattern})$`));
    const endOfMonthMatch = query.match(new RegExp(`^end of (${monthPattern})$`));
    if (!monthMatch && !endOfMonthMatch) {
      return null;
    }
    const modifier = monthMatch?.[1] ?? "end of";
    const monthName = monthMatch?.[2] ?? endOfMonthMatch?.[1];
    const targetMonth = monthAliases.find(([alias]) => alias === monthName)?.[1];
    if (targetMonth === void 0) {
      return null;
    }
    const targetDate = today.clone().month(targetMonth).startOf("month");
    if (targetDate.isBefore(today, "month") || modifier === "next") {
      targetDate.add(1, "year");
    }
    if (modifier === "mid" || modifier === "middle of") {
      return targetDate.date(15);
    }
    if (modifier === "end of") {
      return targetDate.endOf("month").startOf("day");
    }
    return targetDate;
  }
  parseWeekdayDate(query, today) {
    const weekdayAliases = WEEKDAYS.flatMap((weekday, index) => [
      [weekday.toLowerCase(), index],
      [weekday.slice(0, 3).toLowerCase(), index]
    ]);
    const weekdayPattern = weekdayAliases.map(([weekday]) => weekday).join("|");
    const weekdayMatch = query.match(new RegExp(`^(?:(next|last|this) )?(${weekdayPattern})$`));
    if (!weekdayMatch) {
      return null;
    }
    const modifier = weekdayMatch[1] ?? "";
    const targetDay = weekdayAliases.find(([weekday]) => weekday === weekdayMatch[2])?.[1];
    if (targetDay === void 0) {
      return null;
    }
    const delta = (targetDay - today.day() + 7) % 7;
    if (modifier === "next") {
      return today.clone().add(delta || 7, "days");
    }
    if (modifier === "last") {
      return today.clone().subtract((today.day() - targetDay + 7) % 7 || 7, "days");
    }
    if (modifier === "this") {
      return today.clone().add(delta, "days");
    }
    return today.clone().add(delta, "days");
  }
  parseAmount(amount) {
    return amount === "a" || amount === "an" ? 1 : parseInt(amount, 10);
  }
  parseWithNaturalLanguageDatesPlugin(input) {
    const pluginManager = this.app.plugins;
    const naturalLanguageDatesPlugin = pluginManager?.getPlugin?.("nldates-obsidian");
    if (!naturalLanguageDatesPlugin?.parseDate) {
      return null;
    }
    try {
      const result = naturalLanguageDatesPlugin.parseDate(input);
      if (result?.moment?.isValid()) {
        return result.moment.clone().startOf("day");
      }
      if (result?.date instanceof Date && !Number.isNaN(result.date.getTime())) {
        return obsidianMoment(result.date).startOf("day");
      }
    } catch (error) {
      console.error("Weekday Commands: failed to parse date with Natural Language Dates", error);
    }
    return null;
  }
  getEffectiveDailyNoteSettings() {
    const nativeSettings = this.getNativeDailyNoteSettings();
    const overriddenFolder = this.normalizeFolder(this.settings.dailyNotesFolder);
    return {
      format: nativeSettings?.format?.trim() || "YYYY-MM-DD",
      folder: overriddenFolder || this.normalizeFolder(nativeSettings?.folder),
      template: nativeSettings?.template?.trim() || "",
      useNativeCreation: !overriddenFolder
    };
  }
  getNativeDailyNoteSettings() {
    const pluginManager = this.app.plugins;
    const periodicNotes = pluginManager?.getPlugin?.("periodic-notes");
    if (periodicNotes?.settings?.daily?.enabled) {
      return periodicNotes.settings.daily;
    }
    const internalPlugins = this.app.internalPlugins;
    return internalPlugins?.getPluginById?.("daily-notes")?.instance?.options;
  }
  buildNotePath(filename, folder) {
    return (0, import_obsidian.normalizePath)(folder ? `${folder}/${filename}.md` : `${filename}.md`);
  }
  normalizeFolder(folder) {
    return (folder ?? "").trim().replace(/^\/+|\/+$/g, "");
  }
  async ensureFolderExists(folder) {
    if (!folder) {
      return;
    }
    const normalizedFolder = (0, import_obsidian.normalizePath)(folder);
    const existingFolder = this.app.vault.getAbstractFileByPath(normalizedFolder);
    if (existingFolder instanceof import_obsidian.TFolder) {
      return;
    }
    await this.app.vault.createFolder(normalizedFolder);
  }
};
var NaturalLanguageDateModal = class extends import_obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.isSubmitting = false;
  }
  onOpen() {
    this.titleEl.setText("Go to daily note");
    this.contentEl.empty();
    const form = this.contentEl.createEl("form");
    const input = new import_obsidian.TextComponent(form);
    input.setPlaceholder("tomorrow, next Friday, 2026-05-29");
    input.inputEl.ariaLabel = "Date";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (this.isSubmitting) {
        return;
      }
      this.isSubmitting = true;
      const didOpenNote = await this.plugin.openDailyNoteFromInput(input.getValue());
      if (didOpenNote) {
        this.close();
      } else {
        this.isSubmitting = false;
        input.inputEl.select();
      }
    });
    window.setTimeout(() => {
      input.inputEl.focus();
      input.inputEl.select();
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var WeekdayCommandsSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Daily notes folder").setDesc("Optional folder override for this plugin. Leave blank to use the Daily Notes plugin folder.").addText(
      (text) => text.setPlaceholder("Daily").setValue(this.plugin.settings.dailyNotesFolder).onChange(async (value) => {
        this.plugin.settings.dailyNotesFolder = value.trim();
        await this.plugin.saveSettings();
      })
    );
  }
};
