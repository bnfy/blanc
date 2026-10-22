# Floating Island spike (Task 0), macOS 27, Electron 44, 2026-10-20

Throwaway branch `spike/floating-island` (deleted). It added a hard-coded transparent 360×76 `WebContentsView` with a CSS-slid pill over the tab view, re-raised after every tab attach, plus a 6px drag strip in the hidden strip document. Reveal was disabled so the strip stayed hidden.

1. **Shadow over the page: pass.** The pill's soft shadow composited over Wikipedia with no backdrop and no seams.
2. **Clicks just outside the view's rect reach the page: pass.** A real mouse click on Wikipedia's search field beside the view focused it and took typing.
3. **Drawing across tab switches: pass.** The view kept drawing after Cmd+T and five Cmd+1/Cmd+2 switches, re-raised above each attached tab.
4. **Slide: pass, with one gap.** `translateY(-viewHeight)` left nothing below the window edge, and the pill came back to rest. Screenshots were too slow to catch a mid-slide frame. By construction the view's top is the window's top, so the pill emerges from above the edge.
5. **Drag strip over a covering tab view: pass.** Dragging the top 6px moved the window 120px.
6. **Double-click on the drag strip: pass.** It zoomed the window to fill the screen.

Side note: while the window was in the background, its bottom 68px once showed the strip colour after the intro hid the strip. It repainted correctly once the window came forward. Watch for this in Task 5 hand checks.
