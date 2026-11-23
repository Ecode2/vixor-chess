# Custom piece models

Drop rigged models here and describe them in `manifest.json` (start by copying
`manifest.example.json`). With no `manifest.json` the game uses its built-in
procedural pieces. Any piece type you leave out also stays procedural, so you
can swap pieces in one at a time (the rook, for instance, can stay the living
siege tower).

## What the game does with your models

- **Scales** each model to the right height for its piece (override with `height`)
  and stands it on the board. No bases.
- **Colours** it with each player's army colours (Settings > Armies). The default
  `"materials": "statue"` turns the whole model into carved ivory/obsidian/etc. while
  keeping its normal and AO maps, so sculpted detail survives. Use `materialMap`
  to make capes "cloth", armour "metal", trims "accent". Use `"tint"` to keep the
  original textures tinted, or `"original"` to leave them untouched.
- **Animates** it: idle, walking while moving, run/gallop for leaps, the attack
  clip during captures (`hitAt` = the impact moment, synced with the effects),
  block/hit when being attacked, death for a checkmated king, victory when
  winning, and `idleAlt` now and then. Missing clips simply fall back to idle.
- **Root motion is stripped** (`"rootMotion": "strip-xz"`), so download
  Mixamo animations either way; "In Place" is still recommended.
- **Dismantles** captured pieces by baking their posed mesh and breaking it into
  fragments of real geometry.
- **Props**: attach built-in `sword`, `greatsword`, `shield`, `mace`, `crown`,
  `kingCrown`, `mitre`, `helm`, `crosier`, `sceptre` to any bone, or your own model
  file (`"model": "props/axe.glb"`). Positions are in board units (1 = a square),
  rotations in degrees.

## Recommended workflow (Mixamo)

1. Pick characters on mixamo.com (search "knight", "paladin", "guard"...), or
   upload a sculpted humanoid from Sketchfab to Mixamo's **auto-rigger**.
2. Download the character: **FBX Binary, With Skin, T-pose**, into e.g. `pawn/`.
3. Download each animation for the same character: **FBX Binary, Without Skin,
   In Place** (where offered), into `anims/`. Mixamo animations share one
   skeleton, so put them in `animationLibrary` and reuse them on every piece
   with `"@name"`.
4. Keep everything for one rig in the same format (all FBX from Mixamo is the
   simplest). Mixing a GLB character with FBX animations can break the unit scale.
5. For the horse: a rigged horse from Sketchfab (search "rigged horse gallop",
   check the licence) as the knight's `model`, with the rider in `rider`.
   `attachTo` picks the horse bone to sit on and `seat` fine-tunes the position.

Supported formats: `.glb`, `.gltf`, `.fbx`. GLBs compressed with Meshopt are supported:

```
npx @gltf-transform/cli optimize in.glb out.glb --compress meshopt --texture-compress webp
```

Keep each character under ~20-30k triangles with textures ≤ 2048px. 32
animated characters render comfortably on desktop. On phones, use the
"Performance" graphics setting.

## Licences

- Mixamo: free for personal and commercial projects. Don't publish the raw
  files as a standalone asset pack, so keep the repo private if they're committed.
- Sketchfab CC-BY models need credit: add them to `credits` in the manifest and
  they're listed in Settings > Game.

## Troubleshooting

Open the browser console:
- `clip "X" not found. Available: [...]` lists the real clip names in the file.
- `clip ... has no tracks matching the model's bones`: the animation was made
  for a different skeleton.
- `prop bone "X" not found`: check bone names (the `mixamorig` prefix is optional).
- A model that fails to load falls back to the procedural piece, with a notice.
