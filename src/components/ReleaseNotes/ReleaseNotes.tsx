import { useMemo, useState, type MouseEvent } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Modal } from "@components/Modal/Modal";
import "./ReleaseNotes.css";

interface ReleaseNotesProps {
  title: string;
  version: string;
  notes: string;
  url: string;
}

marked.setOptions({ gfm: true, breaks: true });

const render = (markdown: string) => {
  const html = marked.parse(markdown, { async: false });
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
};

const external = (event: MouseEvent<HTMLDivElement>) => {
  const link = (event.target as HTMLElement).closest("a");

  if (!link?.href) return;

  event.preventDefault();
  void openUrl(link.href).catch(() => undefined);
};

const LONG = 900;

export function ReleaseNotes({ title, version, notes, url }: ReleaseNotesProps) {
  const [open, setOpen] = useState(false);
  const html = useMemo(() => render(notes), [notes]);
  const long = notes.length > LONG || notes.split("\n").length > 14;

  if (!notes.trim()) {
    return (
      <p className="notes__empty">
        No release notes were written for {version}.{" "}
        <button className="notes__link" onClick={() => void openUrl(url)}>
          View on GitHub
        </button>
      </p>
    );
  }

  return (
    <>
      <div className={`notes${long ? " notes--clamped" : ""}`}>
        <div
          className="notes__body markdown"
          onClick={external}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {long && (
          <div className="notes__fade">
            <button className="notes__more" onClick={() => setOpen(true)}>
              Read full release notes
            </button>
          </div>
        )}
      </div>

      <Modal
        open={open}
        label="Release notes"
        variant="notes"
        onDismiss={() => setOpen(false)}
      >
        <h2 className="modal__title">{title}</h2>
        <p className="notes__version">Version {version}</p>

        <div className="notes__scroll">
          <div
            className="markdown"
            onClick={external}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>

        <div className="modal__actions">
          <button className="modal__button" onClick={() => void openUrl(url)}>
            View on GitHub
          </button>
          <button
            className="modal__button modal__button--primary"
            onClick={() => setOpen(false)}
          >
            Done
          </button>
        </div>
      </Modal>
    </>
  );
}
