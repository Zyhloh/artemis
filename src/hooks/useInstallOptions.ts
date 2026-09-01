import { useCallback, useEffect, useState } from "react";
import { installOptions, installTags } from "@lib/install";
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
  PathStatus
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

    const load = async () => {
      const [found, suggested, sizes] = await Promise.all([
        installOptions(game.appName).catch(() => []),
        defaultInstallPath(game.title).catch(() => ""),
        installManifest(game.appName).catch(() => null)
      ]);

      if (!live) return;

      setManifest(sizes);
      setOptions(found);
      setSelected(found.filter((entry) => entry.required).map((entry) => entry.id));
      setPath(suggested);
      setStatus("ready");
    };

    void load();

    return () => {
      live = false;
    };
  }, [game]);

  const inspect = useCallback(async () => {
    if (!path) return;

    const [result, free] = await Promise.all([
      probeInstallPath(path).catch(() => null),
      installSpace(path).catch(() => null)
    ]);

    if (result) setAccess(result);
    setSpace(free);
  }, [path]);

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

  const download = manifest
    ? tags.reduce(
        (total, tag) =>
          total +
          (manifest.tags.find((entry) => entry.tag === tag)?.download ?? 0),
        0
      )
    : 0;

  const needed = manifest
    ? tags.reduce(
        (total, tag) =>
          total + (manifest.tags.find((entry) => entry.tag === tag)?.disk ?? 0),
        0
      )
    : 0;

  return {
    options,
    selected,
    tags,
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
