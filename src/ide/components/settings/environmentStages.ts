export interface StageMeta {
  index: number;
  name: string;
  title: string;
  desc: string;
  packages: string[];
}

export const STAGES: StageMeta[] = [
  {
    index: 1,
    name: "CoreUtilities",
    title: "Stage 1: Core CLI & Node.js",
    desc: "bash, coreutils, git, ripgrep, sqlite3, nodejs, npm",
    packages: [
      "bash", "coreutils", "findutils", "grep", "sed", "gawk",
      "ripgrep", "tar", "gzip", "zip", "unzip", "tree",
      "ca-certificates", "curl", "wget", "git", "openssh-client",
      "sqlite3", "nodejs", "npm",
    ],
  },
  {
    index: 2,
    name: "Python",
    title: "Stage 2: Python 3",
    desc: "python3, python3-pip",
    packages: [
      "python3", "python3-pip",
    ],
  },
  {
    index: 3,
    name: "BuildTools",
    title: "Stage 3: C/C++ Build Tools",
    desc: "make, gcc, g++, build-essential, libicu-dev",
    packages: ["make", "gcc", "g++", "build-essential", "libicu-dev"],
  },
];
