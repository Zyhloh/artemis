import { close, minimize, toggleMaximize } from "@lib/window";
import { useWindowFocus } from "@hooks/useWindowFocus";
import { useWindowState } from "@hooks/useWindowState";
import "./TrafficLights.css";

interface TrafficLightsProps {
  zoomable?: boolean;
}

export function TrafficLights({ zoomable = true }: TrafficLightsProps) {
  const focused = useWindowFocus();
  const { maximized } = useWindowState();

  return (
    <div className={`traffic${focused ? "" : " traffic--inactive"}`}>
      <button
        className="light light--close"
        onClick={close}
        aria-label="Close"
      >
        <svg className="light__glyph" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3.9 3.9 8.1 8.1M8.1 3.9 3.9 8.1" />
        </svg>
      </button>

      <button
        className="light light--minimize"
        onClick={minimize}
        aria-label="Minimize"
      >
        <svg className="light__glyph" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3.2 6h5.6" />
        </svg>
      </button>

      <button
        className={`light light--zoom${zoomable ? "" : " light--disabled"}`}
        onClick={zoomable ? toggleMaximize : undefined}
        disabled={!zoomable}
        aria-label={maximized ? "Restore" : "Zoom"}
      >
        <svg
          className="light__glyph light__glyph--fill"
          viewBox="0 0 12 12"
          aria-hidden="true"
        >
          {maximized ? (
            <>
              <path d="M3.1 7.6h3.3v3.3z" />
              <path d="M8.9 4.4H5.6V1.1z" />
            </>
          ) : (
            <>
              <path d="M2.8 2.8h4.4L2.8 7.2z" />
              <path d="M9.2 9.2H4.8l4.4-4.4z" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
