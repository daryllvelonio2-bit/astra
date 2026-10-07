import { AppTheme } from "../ide/services/configService";

export type StartupStepId = "theme" | "permissions" | "github" | "guide";

export interface StartupConfig {
  selectedTheme: AppTheme;
  githubConfigured: boolean;
}
