import { AppTheme } from "../ide/services/configService";

export type StartupStepId = "theme" | "permissions" | "github";

export interface StartupConfig {
  selectedTheme: AppTheme;
  githubConfigured: boolean;
}
