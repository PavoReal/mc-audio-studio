import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WaveformCanvas } from "./WaveformCanvas";

const captures = new WeakMap<Element, Set<number>>();

describe("WaveformCanvas playback marker", () => {
  beforeEach(() => {
    vi.stubGlobal("PointerEvent", class extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    });
    vi.stubGlobal("matchMedia", () => ({
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }));
    vi.stubGlobal("ResizeObserver", class {
      observe() { /* The test uses a fixed element rectangle. */ }
      disconnect() { /* No resources are active. */ }
    });
    Object.defineProperties(HTMLElement.prototype, {
      setPointerCapture: {
        configurable: true,
        value(pointerId: number) {
          const active = captures.get(this) ?? new Set<number>();
          active.add(pointerId);
          captures.set(this, active);
        }
      },
      hasPointerCapture: {
        configurable: true,
        value(pointerId: number) { return captures.get(this)?.has(pointerId) ?? false; }
      },
      releasePointerCapture: {
        configurable: true,
        value(pointerId: number) { captures.get(this)?.delete(pointerId); }
      }
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40,
      toJSON: () => ({})
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
    delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
    delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture;
  });

  it("shows an always-visible slider and keeps keyboard playback state callbacks together", () => {
    const start = vi.fn();
    const change = vi.fn();
    const end = vi.fn();
    render(<WaveformCanvas
      envelope={[]}
      duration={4}
      selection={null}
      playheadTime={1}
      interactive={false}
      onPlayheadDragStart={start}
      onPlayheadChange={change}
      onPlayheadDragEnd={end}
    />);

    const marker = screen.getByRole("slider", { name: "Playback position" });
    expect(marker).toHaveAttribute("aria-valuenow", "1");
    fireEvent.keyDown(marker, { key: "ArrowRight" });
    expect(start).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenLastCalledWith(1.01);
    expect(end).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(marker, { key: "ArrowLeft", shiftKey: true });
    expect(change).toHaveBeenLastCalledWith(0.9);
  });

  it("captures marker drags without starting a trim gesture", () => {
    const selectionChange = vi.fn();
    const start = vi.fn();
    const change = vi.fn();
    const end = vi.fn();
    render(<WaveformCanvas
      envelope={[]}
      duration={2}
      selection={{ start: 0, end: 2 }}
      onSelectionChange={selectionChange}
      playheadTime={0.5}
      interactive
      onPlayheadDragStart={start}
      onPlayheadChange={change}
      onPlayheadDragEnd={end}
    />);

    const marker = screen.getByRole("slider", { name: "Playback position" });
    fireEvent.pointerDown(marker, { pointerId: 7, clientX: 25 });
    fireEvent.pointerMove(marker, { pointerId: 7, clientX: 75 });
    fireEvent.pointerUp(marker, { pointerId: 7, clientX: 75 });

    expect(start).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenLastCalledWith(1.5);
    expect(end).toHaveBeenCalledTimes(1);
    expect(selectionChange).not.toHaveBeenCalled();
  });

  it("ends a marker gesture when the pointer is canceled", () => {
    const end = vi.fn();
    render(<WaveformCanvas
      envelope={[]}
      duration={1}
      selection={null}
      playheadTime={0}
      interactive={false}
      onPlayheadChange={() => undefined}
      onPlayheadDragEnd={end}
    />);

    const marker = screen.getByRole("slider", { name: "Playback position" });
    fireEvent.pointerDown(marker, { pointerId: 3, clientX: 0 });
    fireEvent.pointerCancel(marker, { pointerId: 3, clientX: 40 });
    expect(end).toHaveBeenCalledTimes(1);
  });
});
