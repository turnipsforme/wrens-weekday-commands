import {
  App,
  Command,
  Modal,
  Notice,
  normalizePath,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
  TextComponent,
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

interface NaturalLanguageDatesPlugin {
  parseDate: (date: string) =>
    | {
        date?: Date;
        moment?: moment.Moment;
      }
    | null
    | undefined;
}

const DEFAULT_SETTINGS: WeekdayCommandsSettings = {
  dailyNotesFolder: "",
};

const obsidianMoment = moment as unknown as {
  (): moment.Moment;
  (input: string | Date): moment.Moment;
  (input: string, format: readonly string[], strict: boolean): moment.Moment;
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const DATE_INPUT_FORMATS = [
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
  "Do MMM",
] as const;

export default class WeekdayCommandsPlugin extends Plugin {
  settings!: WeekdayCommandsSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "open-daily-note-by-date",
      name: "Go to daily note by date",
      callback: () => {
        new NaturalLanguageDateModal(this.app, this).open();
      },
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
    await this.openDailyNote(nextDate);
  }

  async openDailyNoteFromInput(input: string): Promise<boolean> {
    const date = this.parseNaturalDate(input);
    if (!date) {
      new Notice(`Could not understand date: ${input}`);
      return false;
    }

    await this.openDailyNote(date);
    return true;
  }

  private async openDailyNote(date: moment.Moment): Promise<void> {
    const dailyNoteSettings = this.getEffectiveDailyNoteSettings();
    const filePath = this.buildNotePath(date.format(dailyNoteSettings.format), dailyNoteSettings.folder);
    const existingFile = this.app.vault.getAbstractFileByPath(filePath);

    if (existingFile instanceof TFile) {
      await this.openFile(existingFile);
      return;
    }

    if (dailyNoteSettings.useNativeCreation) {
      try {
        const createdFile = await this.createDailyNoteLikeCalendar(date, dailyNoteSettings);
        if (createdFile instanceof TFile) {
          await this.openFile(createdFile);
          return;
        }
      } catch (error) {
        console.error("Weekday Commands: failed to create daily note with Daily Notes template", error);
      }
    }

    await this.ensureFolderExists(dailyNoteSettings.folder);
    await this.app.vault.create(filePath, await this.renderDailyNoteTemplate(date, dailyNoteSettings));
    const createdFile = this.app.vault.getAbstractFileByPath(filePath);
    if (createdFile instanceof TFile) {
      await this.openFile(createdFile);
      return;
    }

    new Notice(`Could not open daily note for ${date.format("YYYY-MM-DD")}.`);
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

  private parseNaturalDate(input: string): moment.Moment | null {
    const query = input.trim().toLowerCase().replace(/\s+/g, " ");
    if (!query) {
      return null;
    }

    const naturalLanguageDatesResult = this.parseWithNaturalLanguageDatesPlugin(input);
    if (naturalLanguageDatesResult) {
      return naturalLanguageDatesResult;
    }

    const today = obsidianMoment().startOf("day");
    const simpleDates: Record<string, moment.Moment> = {
      today,
      "right now": today,
      tomorrow: today.clone().add(1, "day"),
      tmr: today.clone().add(1, "day"),
      yesterday: today.clone().subtract(1, "day"),
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

  private parseRelativeDate(query: string, today: moment.Moment): moment.Moment | null {
    const unitAliases: Record<string, moment.unitOfTime.DurationConstructor> = {
      day: "day",
      days: "day",
      week: "week",
      weeks: "week",
      month: "month",
      months: "month",
      year: "year",
      years: "year",
    };
    const numberPattern = "(a|an|\\d+)";
    const relativeMatch =
      query.match(new RegExp(`^in ${numberPattern} (${Object.keys(unitAliases).join("|")})$`)) ??
      query.match(new RegExp(`^${numberPattern} (${Object.keys(unitAliases).join("|")}) from now$`));
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
      return today.clone().add(amount, unit as moment.unitOfTime.DurationConstructor);
    }

    return null;
  }

  private parseNamedMonthDate(query: string, today: moment.Moment): moment.Moment | null {
    const monthAliases = [
      ...moment.months().map((monthName, index) => [monthName.toLowerCase(), index] as const),
      ...moment.monthsShort().map((monthName, index) => [monthName.toLowerCase(), index] as const),
    ];
    const monthPattern = monthAliases.map(([monthName]) => monthName.replace(".", "\\.")).join("|");
    const monthMatch = query.match(new RegExp(`^(next|mid|middle of|start of|end of) (${monthPattern})$`));
    const endOfMonthMatch = query.match(new RegExp(`^end of (${monthPattern})$`));
    if (!monthMatch && !endOfMonthMatch) {
      return null;
    }

    const modifier = monthMatch?.[1] ?? "end of";
    const monthName = monthMatch?.[2] ?? endOfMonthMatch?.[1];
    const targetMonth = monthAliases.find(([alias]) => alias === monthName)?.[1];
    if (targetMonth === undefined) {
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

  private parseWeekdayDate(query: string, today: moment.Moment): moment.Moment | null {
    const weekdayAliases = WEEKDAYS.flatMap((weekday, index) => [
      [weekday.toLowerCase(), index] as const,
      [weekday.slice(0, 3).toLowerCase(), index] as const,
    ]);
    const weekdayPattern = weekdayAliases.map(([weekday]) => weekday).join("|");
    const weekdayMatch = query.match(new RegExp(`^(?:(next|last|this) )?(${weekdayPattern})$`));
    if (!weekdayMatch) {
      return null;
    }

    const modifier = weekdayMatch[1] ?? "";
    const targetDay = weekdayAliases.find(([weekday]) => weekday === weekdayMatch[2])?.[1];
    if (targetDay === undefined) {
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

  private parseAmount(amount: string): number {
    return amount === "a" || amount === "an" ? 1 : parseInt(amount, 10);
  }

  private parseWithNaturalLanguageDatesPlugin(input: string): moment.Moment | null {
    const pluginManager = (this.app as App & { plugins?: { getPlugin?: (id: string) => unknown } }).plugins;
    const naturalLanguageDatesPlugin = pluginManager?.getPlugin?.("nldates-obsidian") as
      | NaturalLanguageDatesPlugin
      | undefined;
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

class NaturalLanguageDateModal extends Modal {
  private isSubmitting = false;

  constructor(app: App, private plugin: WeekdayCommandsPlugin) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Go to daily note");
    this.contentEl.empty();

    const form = this.contentEl.createEl("form");
    const input = new TextComponent(form);
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

  onClose(): void {
    this.contentEl.empty();
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
