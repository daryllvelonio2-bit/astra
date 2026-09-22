export type ExecutionTier = "client" | "terminal" | "native";

export interface ExecutionRequest {
  code: string;
  language: string;
  tier?: ExecutionTier;
  workspaceId?: string;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
  environment?: string;
}

