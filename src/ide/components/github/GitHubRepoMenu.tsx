import React from "react";
import { GitHubNavigation } from "./useGitHubNavigation";
import { MenuItem, openMenu } from "./GitHubMenuList";

/**
 * Repo header overflow. Commits / Releases / Contributors / Settings used to
 * be four buttons crowding the header into a horizontal scroll strip; they
 * now live behind one ⋯ tap, rendered by the shared menu list.
 */

export function openRepoMenu({
  nav,
  owner,
  repo,
  refName,
  onClone,
}: {
  nav: GitHubNavigation;
  owner: string;
  repo: string;
  refName: string;
  onClone: () => void;
}): void {
  const items: MenuItem[] = [
    {
      icon: "download",
      label: "Clone",
      hint: "Copy this repository into the current workspace",
      onPress: onClone,
    },
    {
      icon: "history",
      label: "Commits",
      hint: `History on ${refName}`,
      onPress: () => nav.push({ name: "commits", owner, repo, ref: refName }),
    },
    {
      icon: "tag",
      label: "Releases",
      hint: "Tags and published releases",
      onPress: () => nav.push({ name: "releases", owner, repo }),
    },
    {
      icon: "people",
      label: "Contributors",
      hint: "Who has committed here",
      onPress: () => nav.push({ name: "contributors", owner, repo }),
    },
    {
      icon: "gear",
      label: "Settings",
      hint: "Edit repository metadata",
      onPress: () => nav.push({ name: "repoSettings", owner, repo }),
    },
  ];

  openMenu({ title: `${owner}/${repo}`, items });
}
