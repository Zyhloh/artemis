import { useCallback, useEffect, useState } from "react";
import { installOptions, installTags, selectedOptions } from "@lib/install";
import {
  defaultInstallPath,
  installManifest,
  installSpace,
  probeInstallPath
} from "@lib/library";
import type {
  InstallManifest,
  InstallOption,
  InstallStatus,
  LibraryGame,
  PathStatus,
  TagSize
} from "@/types";

export function useInstallOptions(game: LibraryGame | null) {
  const [options, setOptions] = useState<InstallOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [path, setPath] = useState("");
  const [access, setAccess] = useState<PathStatus | null>(null);
  const [manifest, setManifest] = useState<InstallManifest | null>(null);
  const [space, setSpace] = useState<number | null>(null);
  const [status, setStatus] = useState<InstallStatus>("loading");

  useEffect(() => {
    if (!game) return;

    let live = true;
    setStatus("loading");

    const settled = game.installed && game.installPath;

    const load = async () => {
      const [found, suggested, sizes] = await Promise.all([
        installOptions(game.appName).catch(() => []),
        settled
          ? Promise.resolve(game.installPath ?? "")
          : defaultInstallPath(game.appName, game.title).catch(() => ""),
        installManifest(game.appName).catch(() => null)
      ]);

      if (!live) return;

      const owned = game.installTags ?? [];

      const current =
        game.installed && owned.length
          ? selectedOptions(game.appName, owned)
          : found.filter((entry) => entry.required).map((entry) => entry.id);

      setManifest(sizes);
      setOptions(found);
      setSelected(current);
      setPath(suggested);
      setStatus("ready");
    };

    void load();

    return () => {
      live = false;
    };
  }, [game]);

  const inspect = useCallback(async () => {
    if (!path || game?.installed) return;

    const [result, free] = await Promise.all([
      probeInstallPath(path).catch(() => null),
      installSpace(path).catch(() => null)
    ]);

    if (result) setAccess(result);
    setSpace(free);
  }, [path, game]);

  useEffect(() => {
    void inspect();
  }, [inspect]);

  const toggle = useCallback((id: string) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id]
    );
  }, []);

  const tags = game ? installTags(game.appName, selected) : [];

  const measure = (pick: (entry: TagSize) => number, whole: number) => {
    if (!manifest) return 0;
    if (!tags.length) return whole;

    return tags.reduce((total, tag) => {
      const entry = manifest.tags.find((size) => size.tag === tag);
      return total + (entry ? pick(entry) : 0);
    }, 0);
  };

  const download = measure(
    (entry) => entry.download,
    manifest?.downloadSize ?? 0
  );

  const needed = measure((entry) => entry.disk, manifest?.diskSize ?? 0);

  return {
    options,
    selected,
    tags,
    manifest,
    download,
    needed,
    space,
    path,
    access,
    status,
    setPath,
    toggle,
    inspect
  };
}
