import { useEffect, useState } from "react";

const RAIL = 56;
const GUTTER = 48;
const CARD = 176;
const MIN = 3;
const MAX = 8;

const count = () => {
  const room = window.innerWidth - RAIL - GUTTER;
  return Math.min(MAX, Math.max(MIN, Math.floor(room / CARD)));
};

export function useColumns() {
  const [columns, setColumns] = useState(count);

  useEffect(() => {
    const update = () => setColumns(count());

    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return columns;
}
