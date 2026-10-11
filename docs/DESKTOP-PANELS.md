# Desktop panel resizing

Unassigned and all groups share a desktop row above 760px. Drag the small width handle at the top right of a box, or its bottom corner. Focus a handle and use arrow keys for keyboard resizing. Increasing width reduces neighbouring widths within the available page space; minimum widths prevent overlap and remain bounded when the window shrinks.

Cards reflow automatically. Panels grow downward to show every active dog, and the whole page scrolls. A manually enlarged height is a minimum only: adding dogs can always extend the panel. Controls never clip dogs or add a nested desktop scrollbar. Width handles stay reachable at the top of tall panels.

These preferences last for the open planner session, survive date changes and do not write to Supabase or change other staff views. Reloading resets the layout. At 760px or less the existing mobile strip, tabs and touch interactions remain, and resize handles are hidden.

Validation on 11 October 2026: TypeScript/build, PWA offline-shell checks, 63 local tests and all 20 Chromium workflow tests passed. Five panel checks cover pointer and keyboard resizing, neighbour redistribution, card reflow, growth/page scrolling, unchanged attendance through moves, mobile switching, four-group data and extreme widths at 1920, 1100, 900 and 761px. The standard 1920×1080 board showed 72 complete group cards at normal zoom with no horizontal overflow. Browser checks used fictional demo data. The integration preserves the latest photo-first tiles, breed labels and staff photo controls. Physical-device testing remains unverified.

Screenshots: [default desktop](screenshots/desktop-1920.png), [resized desktop](screenshots/resizable-desktop.png).
