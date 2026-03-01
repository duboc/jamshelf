# Jamshelf — Planning Document

## Bug Fixes (Done)

### Auto-scroll not working
**Root cause:** `doScroll` was a `useCallback` dependency, so every time `autoScrollSpeed` changed it created a new function reference, which triggered `useEffect` to cancel and restart the animation frame — effectively breaking continuous scroll.

**Fix:** Replaced with a stable `useEffect` loop that reads speed from a `ref` instead of a closure. Speed changes now take effect immediately without restarting the loop.

**Files changed:** `components/chord-sheet/ChordSheet.tsx`

---

### Capo not affecting chord display
**Root cause:** Capo was stored in the `.cho` file (via `patchMeta`) and displayed in the UI, but it was never synced to `playerStore.capo` and never added to the transposition calculation. `ChordBadge` only used `store.transpose`, so capo had no effect on what was rendered.

**Fix:**
1. Song page now syncs `song.capo → store.setCapo()` on load/change (just like it syncs tempo → BPM)
2. `ChordBadge` now transposes by `transpose + capo` instead of just `transpose`
3. Displayed key and chord bar both use `totalShift = store.transpose + store.capo`

**Files changed:** `app/song/[id]/page.tsx`, `components/chord-sheet/ChordBadge.tsx`

---

## Planned Features

### 1. Star Rating System
Each song gets a 1–5 star rating (or 0 = unrated). Stored per song in the `ChordProEntry` metadata via a custom ChordPro directive `{rating: 3}`. Stars display on `SongCard` and can be set from the song list or the song viewer.

**Implementation:**
- Add `{rating: N}` to ChordPro parser (new metadata field on `ParsedSong`)
- `SongCard`: render 5 clickable stars, call `patchMeta(id, 'rating', n)`
- Song viewer header: also shows/edits the rating
- Song list: show star count as a badge on each card

**Files to change:** `lib/utils/chordpro-parser.ts`, `lib/types/song.ts`, `components/song-list/SongCard.tsx`, `app/song/[id]/page.tsx`

---

### 2. Favorites
A special "Favorites" list — songs marked with a heart. Stored as `{favorite: true}` in ChordPro metadata. Shown with a heart icon on `SongCard`. The home page gets a filter tab: **All | Favorites**.

**Implementation:**
- Parse `{favorite: true}` directive → `ParsedSong.favorite: boolean`
- `SongCard`: heart icon button, toggles `patchMeta(id, 'favorite', 'true'/'false')`
- Home page: add tab strip `All | ★ Favorites` — filters `getSongs()` by `song.favorite`

**Files to change:** `lib/utils/chordpro-parser.ts`, `lib/types/song.ts`, `components/song-list/SongCard.tsx`, `app/page.tsx`

---

### 3. Setlists
A setlist is an ordered collection of song IDs with a name. Multiple setlists can exist (e.g. "Friday Rehearsal", "Gig 2024-03-15"). Setlists live in a separate Zustand store (`setlist-store.ts`) persisted to localStorage.

**Data model:**
```typescript
interface Setlist {
  id: string;          // "setlist-1234"
  name: string;        // "Friday Rehearsal"
  songIds: string[];   // ordered array of song IDs
  createdAt: number;
}
```

**Pages/routes:**
- `/setlists` — list of setlists with song count and create button
- `/setlists/[id]` — full setlist view: song list in order, drag-to-reorder, launch song from here
- From the song viewer: "Add to setlist" button → dropdown of existing setlists

**Implementation steps:**
1. Create `lib/stores/setlist-store.ts` with `setlists`, `createSetlist`, `addSongToSetlist`, `removeSongFromSetlist`, `reorderSetlist`, `deleteSetlist`
2. Create `app/setlists/page.tsx` — setlist browser
3. Create `app/setlists/[id]/page.tsx` — setlist player/viewer (song list → click to open song)
4. Create `components/setlists/SetlistCard.tsx`
5. Add "Add to Setlist" button to song viewer and `SongCard`

**UX flow:**
- From home: tap "Setlists" tab → see all setlists → tap one → see songs in order
- From a song: "Add to Setlist" opens a mini-modal listing existing setlists + "New setlist" option
- Inside a setlist view: songs are reorderable; tapping a song opens it in the full viewer, with a "next song" button to go back to the setlist

---

### 4. Home Page Redesign (tabs)
The home page currently shows all songs. With favorites + setlists, it needs navigation tabs:

```
[ All Songs ] [ ★ Favorites ] [ Setlists ]
```

- **All Songs**: current behavior, with search
- **Favorites**: filtered by `song.favorite === true`
- **Setlists**: shows the setlist list (or embeds `/setlists` content inline)

---

## Implementation Priority

| Priority | Feature | Effort |
|----------|---------|--------|
| 1 | Star rating | Small — just metadata + UI stars on card |
| 2 | Favorites | Small — boolean metadata + filter tab |
| 3 | Home page tabs | Small — conditional render based on active tab |
| 4 | Setlists | Medium — new store, 2 new routes, add-to-setlist UX |

---

## Technical Notes

### ChordPro custom directives
We're extending ChordPro with app-specific directives that standard ChordPro renderers would ignore:
```
{rating: 4}
{favorite: true}
```
These are safe to add — the ChordPro spec allows any `{key: value}` directive; unknown ones are silently ignored by other tools.

### Setlist ordering
Use an array of IDs (`songIds: string[]`) — reordering is just array splice. No need for a complex ordered data structure. Drag-to-reorder can use the HTML5 Drag API or simple up/down buttons for simplicity.

### No external drag library needed
Simple up/down arrow buttons for setlist reordering keeps the bundle small and avoids adding a dependency.
