# Audio pack

The game synthesises every sound it makes. That is why it ships as a single
HTML file you can download and open with no internet and no folder of assets.

Put MP3s in this folder and they are used instead. Anything missing falls
back to synthesis, so a partial pack is fine — you can add one file at a
time and hear the difference immediately.

The game finds them on the first sound. `Settings → Audio pack` lists what
was found and lets you point at a different folder.

## The manifest

Name the files exactly as below, `.mp3`, in this folder.

### The crowd — four beds, crossfaded live

The game does not simply turn one crowd up and down; it crossfades between
these four as the match turns, because the difference between a nervous
ground and a roaring one is timbre, not volume. **These must loop
seamlessly** — thirty clean seconds beats three minutes with a seam.

| file | what it is |
|---|---|
| `crowd_base.mp3` | general murmur, nothing happening |
| `crowd_tension.mp3` | edgy and expectant — a corner, a late 1–0 |
| `crowd_roar.mp3` | sustained roar for a spell of pressure |
| `crowd_away.mp3` | the away end, used when you are the visitors |

### Moments — one-shots

| file | what it is |
|---|---|
| `goal_home.mp3` | the eruption, 4–6 seconds |
| `goal_away.mp3` | silence, and a small away pocket celebrating |
| `near_miss.mp3` | the *oooooh* |
| `whistle_start.mp3` | kick-off |
| `whistle_half.mp3` | half time |
| `whistle_full.mp3` | full time |
| `whistle_foul.mp3` | a foul |
| `kick.mp3` | boot on ball |
| `post.mp3` | off the woodwork |

### The ground

| file | what it is |
|---|---|
| `tannoy_goal.mp3` | PA announcing a scorer |
| `tannoy_teams.mp3` | PA reading the teams out |
| `anthem.mp3` | walk-out music |

### Menus

| file | what it is |
|---|---|
| `theme.mp3` | title music (loops) |
| `sting_win.mp3` | short win sting |
| `sting_lose.mp3` | short defeat sting |

## Notes on sourcing

**A music generator is the wrong tool for the crowd.** Suno and similar are
excellent at songs and will do a fine job of `theme`, `anthem`, `sting_win`
and `sting_lose`. They are poor at ambience: a crowd bed needs to be
featureless and loop invisibly, and a music model will put structure,
rhythm and a tail into it — all of which you will hear on every loop point.

For the four crowd beds and the one-shots, either record them or take CC0
recordings (freesound.org has good stadium ambience). Failing that, the
built-in synthesis is the fallback and costs nothing.

**Keep them small.** Mono, 96–128 kbps is plenty for ambience. The whole
pack should sit comfortably under 10 MB, and the crowd beds are the only
long files in it.
