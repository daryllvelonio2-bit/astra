export interface RunningTask {
  id: string;
  command: string;
  port?: number;
  url?: string;
  status: "running" | "stopped" | "failed";
}
