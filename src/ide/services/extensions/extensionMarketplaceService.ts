import { ExtensionMarketplaceItem } from "./types";

const OPEN_VSX_API = "https://open-vsx.org/api";

/**
 * Searches Open VSX marketplace for real extensions.
 * When query is empty, fetches the top most-downloaded real extensions directly from Open VSX.
 */
export async function searchMarketplace(
  query: string = "",
  category?: string,
  size = 25
): Promise<ExtensionMarketplaceItem[]> {
  try {
    const trimmed = query.trim();
    let url = trimmed
      ? `${OPEN_VSX_API}/-/search?query=${encodeURIComponent(trimmed)}&size=${size}&sort=downloadCount`
      : `${OPEN_VSX_API}/-/search?size=${size}&sort=downloadCount`;
    if (category) {
      url += `&category=${encodeURIComponent(category)}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Astra-Mobile-IDE/1.0",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Open VSX returned HTTP ${res.status}`);
    }

    const data = await res.json();
    const rawList = Array.isArray(data.extensions) ? data.extensions : [];

    return rawList.map((ext: any): ExtensionMarketplaceItem => {
      const namespace = ext.namespace || "unknown";
      const name = ext.name || "unknown";
      const id = `${namespace}.${name}`;
      const downloadUrl =
        ext.files?.download ||
        `${OPEN_VSX_API}/${namespace}/${name}/${ext.version}/file/${namespace}.${name}-${ext.version}.vsix`;

      return {
        id,
        namespace,
        name,
        version: ext.version || "1.0.0",
        displayName: ext.displayName || ext.name || id,
        description: ext.description || "No description provided.",
        publisher: namespace,
        iconUrl: ext.files?.icon,
        downloadUrl,
        downloadCount: ext.downloadCount || 0,
        averageRating: ext.averageRating,
        categories: ext.categories,
      };
    });
  } catch (_err: any) {
    return [];
  }
}


/**
 * Fetches specific extension details by namespace and name.
 */
export async function getExtensionDetails(
  namespace: string,
  name: string
): Promise<ExtensionMarketplaceItem | null> {
  try {
    const url = `${OPEN_VSX_API}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Astra-Mobile-IDE/1.0" },
    });
    if (!res.ok) return null;
    const ext = await res.json();

    const id = `${namespace}.${name}`;
    const downloadUrl =
      ext.files?.download ||
      `${OPEN_VSX_API}/${namespace}/${name}/${ext.version}/file/${namespace}.${name}-${ext.version}.vsix`;

    return {
      id,
      namespace,
      name,
      version: ext.version || "1.0.0",
      displayName: ext.displayName || ext.name || id,
      description: ext.description || "",
      publisher: namespace,
      iconUrl: ext.files?.icon,
      downloadUrl,
      downloadCount: ext.downloadCount,
      averageRating: ext.averageRating,
      categories: ext.categories,
    };
  } catch {
    return null;
  }
}
