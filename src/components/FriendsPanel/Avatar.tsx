import { useEffect, useState } from "react";
import { STOCK_FACE } from "@lib/avatars";
import { initial } from "@lib/display";
import type { FriendState } from "@/types";

interface AvatarProps {
  name: string;
  face: string | null;
  state?: FriendState;
  large?: boolean;
}

export function Avatar({ name, face, state, large = false }: AvatarProps) {
  const [source, setSource] = useState(face ?? STOCK_FACE);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setSource(face ?? STOCK_FACE);
    setBroken(false);
  }, [face]);

  const stock = source === STOCK_FACE;

  const fail = () => {
    if (stock) setBroken(true);
    else setSource(STOCK_FACE);
  };

  const shell = large ? "profile__avatar" : "social__avatar";
  const shade = state ? ` social__avatar--${state}` : "";

  return (
    <span className={`${shell}${shade}`} aria-hidden="true">
      {broken ? (
        initial(name)
      ) : (
        <img
          className={`social__face${stock ? " social__face--stock" : ""}`}
          src={source}
          alt=""
          loading="lazy"
          draggable={false}
          onError={fail}
        />
      )}
    </span>
  );
}
