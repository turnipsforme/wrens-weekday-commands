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
var WeekdayCommandsPlugin = class extends import_obsidian.Plugin {
  async onload() {
    await this.loadSettings();
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
    const dailyNoteSettings = this.getEffectiveDailyNoteSettings();
    const filePath = this.buildNotePath(nextDate.format(dailyNoteSettings.format), dailyNoteSettings.folder);
    const existingFile = this.app.vault.getAbstractFileByPath(filePath);
    if (existingFile instanceof import_obsidian.TFile) {
      await this.openFile(existingFile);
      return;
    }
    if (dailyNoteSettings.useNativeCreation) {
      try {
        const createdFile2 = await this.createDailyNoteLikeCalendar(nextDate, dailyNoteSettings);
        if (createdFile2 instanceof import_obsidian.TFile) {
          await this.openFile(createdFile2);
          return;
        }
      } catch (error) {
        console.error("Weekday Commands: failed to create daily note with Daily Notes template", error);
      }
    }
    await this.ensureFolderExists(dailyNoteSettings.folder);
    await this.app.vault.create(filePath, await this.renderDailyNoteTemplate(nextDate, dailyNoteSettings));
    const createdFile = this.app.vault.getAbstractFileByPath(filePath);
    if (createdFile instanceof import_obsidian.TFile) {
      await this.openFile(createdFile);
      return;
    }
    new import_obsidian.Notice(`Could not open daily note for ${nextDate.format("YYYY-MM-DD")}.`);
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
