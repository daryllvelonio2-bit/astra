import { copyToClipboard, getStringFromClipboard } from "../../../modules/linux-runner/src";

export async function setStringAsync(text: string): Promise<boolean> {
  return copyToClipboard(text);
}

export async function getStringAsync(): Promise<string> {
  return getStringFromClipboard();
}

export const Clipboard = {
  setStringAsync,
  getStringAsync,
};
