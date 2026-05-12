import {
  App,
  Command,
  Notice,
  normalizePath,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
  moment,
} from "obsidian";

interface WeekdayCommandsSettings {
  dailyNotesFolder: string;
}

interface NativeDailyNoteSettings {
  format: string;
  folder: string;
  template: string;
}

interface EffectiveDailyNoteSettings extends NativeDailyNoteSettings {
  useNativeCreation: boolean;
}

const DEFAULT_SETTINGS: WeekdayCommandsSettings = {
  dailyNotesFolder: "",
};

const obsidianMoment = moment as unknown as () => moment.Moment;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export default class WeekdayCommandsPlugin extends Plugin {
  settings!: WeekdayCommandsSettings;

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

  private createWeekdayCommand(targetDay: number, label: string): Command {
    return {
      id: `open-next-${label.toLowerCase()}-daily-note`,
      name: `Go to next ${label}`,
      callback: async () => {
        await this.openNextWeekdayNote(targetDay);
      },
    };
  }

  private async openNextWeekdayNote(targetDay: number): Promise<void> {
    const nextDate = this.getNextWeekday(targetDay);
    const dailyNoteSettings = this.getEffectiveDailyNoteSettings();
    const filePath = this.buildNotePath(nextDate.format(dailyNoteSettings.format), dailyNoteSettings.folder);
    const existingFile = this.app.vault.getAbstractFileByPath(filePath);

    if (existingFile instanceof TFile) {
      await this.openFile(existingFile);
      return;
    }

    if (dailyNoteSettings.useNativeCreation) {
      try {
        const createdFile = await this.createDailyNoteLikeCalendar(nextDate, dailyNoteSettings);
        if (createdFile instanceof TFile) {
          await this.openFile(createdFile);
          return;
        }
      } catch (error) {
        console.error("Weekday Commands: failed to create daily note with Daily Notes template", error);
      }
    }

    await this.ensureFolderExists(dailyNoteSettings.folder);
    await this.app.vault.create(filePath, await this.renderDailyNoteTemplate(nextDate, dailyNoteSettings));
    const createdFile = this.app.vault.getAbstractFileByPath(filePath);
    if (createdFile instanceof TFile) {
      await this.openFile(createdFile);
      return;
    }

    new Notice(`Could not open daily note for ${nextDate.format("YYYY-MM-DD")}.`);
  }

  private async createDailyNoteLikeCalendar(
    date: moment.Moment,
    dailyNoteSettings: EffectiveDailyNoteSettings
  ): Promise<TFile | null | undefined> {
    const filename = date.format(dailyNoteSettings.format);
    const filePath = this.buildNotePath(filename, dailyNoteSettings.folder);
    await this.ensureFolderExists(dailyNoteSettings.folder);
    return this.app.vault.create(filePath, await this.renderDailyNoteTemplate(date, dailyNoteSettings));
  }

  private async renderDailyNoteTemplate(
    date: moment.Moment,
    dailyNoteSettings: EffectiveDailyNoteSettings
  ): Promise<string> {
    const templateContents = await this.getTemplateContents(dailyNoteSettings.template);
    const filename = date.format(dailyNoteSettings.format);

    return templateContents
      .replace(/{{\s*date\s*}}/gi, filename)
      .replace(/{{\s*time\s*}}/gi, obsidianMoment().format("HH:mm"))
      .replace(/{{\s*title\s*}}/gi, filename)
      .replace(
        /{{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi,
        (_match, _timeOrDate, calc, timeDelta, unit, momentFormat) => {
          const now = obsidianMoment();
          const currentDate = date.clone().set({
            hour: now.get("hour"),
            minute: now.get("minute"),
            second: now.get("second"),
          });

          if (calc) {
            currentDate.add(parseInt(timeDelta, 10), unit as moment.unitOfTime.DurationConstructor);
          }

          if (momentFormat) {
            return currentDate.format(momentFormat.substring(1).trim());
          }

          return currentDate.format(dailyNoteSettings.format);
        }
      )
      .replace(/{{\s*yesterday\s*}}/gi, date.clone().subtract(1, "day").format(dailyNoteSettings.format))
      .replace(/{{\s*tomorrow\s*}}/gi, date.clone().add(1, "day").format(dailyNoteSettings.format));
  }

  private async getTemplateContents(template: string): Promise<string> {
    if (!template) {
      return "";
    }

    const templatePath = normalizePath(template);
    const templateFile = this.app.metadataCache.getFirstLinkpathDest(templatePath, "");
    if (!(templateFile instanceof TFile)) {
      new Notice(`Daily note template not found: ${template}`);
      return "";
    }

    return this.app.vault.cachedRead(templateFile);
  }

  private async openFile(file: TFile): Promise<void> {
    const mode = (this.app.vault as { getConfig?: (key: string) => string | undefined }).getConfig?.("defaultViewMode");
    await this.app.workspace.getUnpinnedLeaf().openFile(file, mode ? ({ mode } as never) : undefined);
  }

  private getNextWeekday(targetDay: number) {
    const today = obsidianMoment().startOf("day");
    const delta = (targetDay - today.day() + 7) % 7 || 7;
    return today.clone().add(delta, "days");
  }

  private getEffectiveDailyNoteSettings(): EffectiveDailyNoteSettings {
    const nativeSettings = this.getNativeDailyNoteSettings();
    const overriddenFolder = this.normalizeFolder(this.settings.dailyNotesFolder);

    return {
      format: nativeSettings?.format?.trim() || "YYYY-MM-DD",
      folder: overriddenFolder || this.normalizeFolder(nativeSettings?.folder),
      template: nativeSettings?.template?.trim() || "",
      useNativeCreation: !overriddenFolder,
    };
  }

  private getNativeDailyNoteSettings(): Partial<NativeDailyNoteSettings> | undefined {
    const pluginManager = (this.app as App & { plugins?: { getPlugin?: (id: string) => unknown } }).plugins;
    const periodicNotes = pluginManager?.getPlugin?.("periodic-notes") as
      | { settings?: { daily?: Partial<NativeDailyNoteSettings> & { enabled?: boolean } } }
      | undefined;
    if (periodicNotes?.settings?.daily?.enabled) {
      return periodicNotes.settings.daily;
    }

    const internalPlugins = (this.app as App & {
      internalPlugins?: { getPluginById?: (id: string) => { instance?: { options?: unknown } } | undefined };
    }).internalPlugins;

    return internalPlugins?.getPluginById?.("daily-notes")?.instance?.options as
      | Partial<NativeDailyNoteSettings>
      | undefined;
  }

  private buildNotePath(filename: string, folder: string): string {
    return normalizePath(folder ? `${folder}/${filename}.md` : `${filename}.md`);
  }

  private normalizeFolder(folder: string | undefined): string {
    return (folder ?? "").trim().replace(/^\/+|\/+$/g, "");
  }

  private async ensureFolderExists(folder: string): Promise<void> {
    if (!folder) {
      return;
    }

    const normalizedFolder = normalizePath(folder);
    const existingFolder = this.app.vault.getAbstractFileByPath(normalizedFolder);
    if (existingFolder instanceof TFolder) {
      return;
    }

    await this.app.vault.createFolder(normalizedFolder);
  }
}

class WeekdayCommandsSettingTab extends PluginSettingTab {
  plugin: WeekdayCommandsPlugin;

  constructor(app: App, plugin: WeekdayCommandsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Daily notes folder")
      .setDesc("Optional folder override for this plugin. Leave blank to use the Daily Notes plugin folder.")
      .addText((text) =>
        text
          .setPlaceholder("Daily")
          .setValue(this.plugin.settings.dailyNotesFolder)
          .onChange(async (value) => {
            this.plugin.settings.dailyNotesFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );
  }
}
