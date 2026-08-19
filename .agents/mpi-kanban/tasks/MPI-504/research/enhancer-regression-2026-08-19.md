# MPI-504 — enhancer recipe regression, 2026-08-19

Bench engine `127.0.0.1:8188`, `qwen3vl_4b_abliterated_fp8_scaled.safetensors` through
core `TextGenerate`. The Prompt Enhancement chain of `krea2_t2i_template.json` rebuilt node
for node in API form — `CLIPLoader 69` → system string `420` + user string `112` →
`StringConcatenate 422/418/419` (ChatML) → `TextGenerate 58` → `StringReplace 423` →
`PreviewAny 242`. `max_length` 512, `sampling_mode` on, temperature 0.5, top_k 64, top_p 0.95,
min_p 0.05, repetition_penalty 1.05, **seed 0**, presence_penalty 0, thinking false.

No image was generated. One sample per input per arm.

**API gotcha, worth keeping.** `TextGenerate.sampling_mode` is a `COMFY_DYNAMICCOMBO_V3`:
its sub-inputs are flat keys **prefixed with the parent id** — `"sampling_mode.temperature"`,
not a nested object and not a bare `temperature`. Getting that wrong returns
`prompt_outputs_failed_validation` / `required_input_missing` naming every sub-input at once,
which reads like the node is broken. `comfy_api/latest/_io.py:1599` is the authority.

---

## v1 — the recipe as drafted (prompts.md, session 1)

**Disproved.** 2 of 4 inputs came back as the example that lives inside the instruction — the
parenthetical `("a weathered Plains chief in his late sixties, ...")`. The user's character was
discarded entirely. Every output also overran the 45-90 word band (86-129) and stated absences.

### `a 1870s Western Indian Chief` — 129 words — FAIL: a_lowercase_nounphrase, c_no_place_light_camera, e_words_45_90

> a weathered Plains chief in his late sixties, broad-shouldered and tall, with a lean, muscular frame, dark skin, salt-and-pepper hair tied back in a thick braid, no facial hair, deep-set brown eyes, faint lines around the mouth and forehead, a small scar above the left eyebrow, no tattoos or marks, wearing a worn leather vest over a faded wool shirt, a heavy wool coat with frayed cuffs and collar, a buckled gunbelt with a single revolver holstered at hip level, a quiver of arrows slung across the back, a heavy leather satchel strapped to the left thigh, the coat’s back shows a rawhide patch over the right shoulder, the braid hangs loose at the nape, the quiver’s strap crosses the spine, the satchel’s strap dips low on the hip.

### `a cyberpunk street medic` — 103 words — FAIL: a_lowercase_nounphrase, e_words_45_90

> a weathered Plains chief in his late sixties, broad-shouldered and tall, with a thick neck and sun-bleached skin, wearing a faded leather vest over a tattered flannel shirt, a worn denim jacket slung low on his hips, a heavy gunbelt with a holstered revolver at his right hip, a leather satchel strapped across his chest, a quiver of arrows tucked beneath his left arm, his hair tied back in a rough braid, scars etched along his jawline and temple, tattoos inked on his forearms, eyes narrowed with age, face lined with deep creases, no facial hair, standing still with arms at his sides.

### `a tired schoolteacher, 40s, red hair` — 91 words — FAIL: a_lowercase_nounphrase, e_words_45_90

> a tired schoolteacher, 40s, medium build, standing at 5'10", female, of mixed heritage, face with soft oval shape, pale skin, long red hair tied back in a loose braid, sparse salt-and-pepper stubble, hazel eyes, faint lines around mouth and forehead, no visible scars or tattoos, wearing a faded navy blazer over a cream blouse, dark trousers with frayed cuffs, worn leather belt with a single buckle, no weapon or pouch, gunbelt absent, quiver or bag not present, rear view shows braid trailing down the back, no slung gear or quivered items.

### `a gunslinger, no weapons` — 86 words — FAIL: a_lowercase_nounphrase, c_no_place_light_camera, f_gear

> a weathered Plains chief in his late sixties, broad-shouldered and tall, with a rugged face and salt-and-pepper hair tied back in a rough knot, deep-set eyes with faint scars across the left cheek, wearing a faded brown leather vest over a coarse wool shirt, a worn gunbelt slung low across his hips, sturdy boots caked with dust, and a heavy duffel bag slung over one shoulder, the back of his vest showing the raw edge of the belt and the duffel’s strap taut against his spine.

---

## v2 — slot-template shape, no readable example, length rule hoisted

Example leak gone, all four on-topic, length down. Absences still stated on 4 of 4, and
`a gunslinger, no weapons` wrote the refusal out five times. Trailing full stop on 4 of 4.

### `a 1870s Western Indian Chief` — 92 words — FAIL: a2_no_trailing_stop, e_words_45_90, g_positive_only

> a 30 year old tall, broad-shouldered male, of mixed indigenous heritage, with a square jaw, dark brown skin, long black hair tied back in a thick braid, no facial hair, deep brown eyes, faint scars along the left cheek and neck, wearing a dark woolen coat over a fringed shirt, leather chaps, a heavy belt with a brass buckle, a holstered rifle at his right hip, a quiver of arrows slung across his back, the coat’s back shows the braid trailing down his spine, the quiver’s strap visible against his shoulder blades.

### `a cyberpunk street medic` — 89 words — FAIL: a2_no_trailing_stop, g_positive_only

> a 32 year old lean, tall, male, of mixed asian descent, with a sharp angular face, pale skin, short black hair slicked back, no facial hair, deep brown eyes, faint scars across the left cheek, wearing a matte black tactical vest over a faded grey t-shirt, dark blue cargo pants, worn combat boots, a silver medical badge pinned to the vest’s right chest, a holstered pistol at hip level, a quiver of needles slung across the back, the vest’s rear panel shows the quiver’s strap and the badge’s edge.

### `a tired schoolteacher, 40s, red hair` — 102 words — FAIL: a2_no_trailing_stop, e_words_45_90, g_positive_only

> a tired schoolteacher, 40s, medium build, standing at 5'8", female, of european descent, with a round face, pale skin, long red hair tied back in a loose braid, no facial hair, hazel eyes, faint lines around the mouth, wearing a faded navy blazer over a cream blouse, dark trousers, worn leather boots, a thin brown belt with a silver buckle, a small leather satchel slung across her left shoulder, the back of the blazer shows a slight crease down the spine, the braid trails down her back, the satchel hangs low on her left hip, the belt is snug against her waist.

### `a gunslinger, no weapons` — 83 words — FAIL: a2_no_trailing_stop, f_gear, g_positive_only

> a 32 year old lean male, standing at 5'10", with a rugged face and sun-weathered skin, wearing a faded brown leather jacket over a black shirt, dark trousers, and worn boots, no belt or holster, hair tied back in a tight braid, face unmarked except for a faint scar above the left eyebrow, no tattoos or jewelry, no weapon on body, back of jacket shows no holster or quiver, hair falls straight down the spine, no gear slung or strapped across the back.

### `use_default_template` A/B

Same recipe, `use_default_template` false instead of true. Output was **byte-identical on all
four inputs**. Node `58` executed fresh in both arms — `/history` reports only `["69","420"]`
as `execution_cached`, so this is a real null result and not the caching trap. The flag is
inert for this node and model; leave the shipped `true`.

Identical-output proof: confirmed byte-identical.

---

## v3 — substitution table for absences, "aim for 70 words"

Length lands 4 of 4 (50-81 words). `clean-shaven` and `the back ... hangs plain` are adopted.
Absences still stated on 4 of 4. Prompt-only iteration is at its ceiling on this model.

### `a 1870s Western Indian Chief` — 65 words — FAIL: a2_no_trailing_stop, g_positive_only

> a 30-year-old tall, broad-shouldered male, of mixed indigenous heritage, with a strong jawline and clean-shaven face, dark brown hair tied back in a thick braid, wearing a faded red woolen coat over a black leather vest, a heavy copper belt with a rusted buckle, a worn leather satchel slung across his chest, the back of the coat hangs plain with no visible gear or markings.

### `a cyberpunk street medic` — 50 words — FAIL: a2_no_trailing_stop, b_nothing_held, f_gear, g_positive_only

> a 32-year-old lean, wiry male, clean-shaven, with short dark hair slicked back, wearing a matte black tactical vest over a faded grey t-shirt, layered with a worn leather jacket, carrying a medical kit slung across his chest, the back of the jacket hangs plain with no visible gear or markings.

### `a tired schoolteacher, 40s, red hair` — 81 words — FAIL: a2_no_trailing_stop, g_positive_only

> a tired schoolteacher, 40s, medium build, standing at 5'8", female, of mixed heritage, with a round face, pale skin, red hair tied back in a loose bun, clean-shaven, light brown eyes, faint lines around the mouth, wearing a faded navy blazer over a cream blouse, dark trousers, worn leather shoes, a single silver pendant on a chain around her neck, no weapon or belt, the back of the blazer hangs plain, hair tied tightly at the nape, no slung gear visible.

### `a gunslinger, no weapons` — 72 words — FAIL: a2_no_trailing_stop, f_gear, g_positive_only

> a 32-year-old lean, wiry man, standing at 5'10", with a clean-shaven face and sharp jawline, wearing a faded brown leather jacket over a black t-shirt, with no visible tattoos or scars, his hair is short, dark, and slicked back, the jacket hangs loose at the back, no quiver or belt, the back of the coat shows no weapon or gear, the fabric is worn but uncreased, the hands remain open and empty.

---

## The scrub, applied to the v3 outputs (offline)

Two core `RegexReplace` nodes:

```
scrub-negation  \s*(?:with|and|but|showing|shows)?\s*\b(?:no|not|none|without|absent|unarmed|devoid|lacking)\b[^,]*   ->  ""
tidy            ,\s*(?=,)|[\s,.]+$                                                                                  ->  ""
```

Cutting the negative **tail** rather than the whole clause is load-bearing: the whole-clause
version was tried first and ate the rear-view sentence on 2 of 4, because the model likes to
end that clause with a negation ("the back of the coat hangs plain with no visible gear").

### `a 1870s Western Indian Chief`

- **65w → 59w**, negation gone, rear view kept, no trailing stop

> a 30-year-old tall, broad-shouldered male, of mixed indigenous heritage, with a strong jawline and clean-shaven face, dark brown hair tied back in a thick braid, wearing a faded red woolen coat over a black leather vest, a heavy copper belt with a rusted buckle, a worn leather satchel slung across his chest, the back of the coat hangs plain

### `a cyberpunk street medic`

- **50w → 44w**, negation gone, rear view kept, no trailing stop

> a 32-year-old lean, wiry male, clean-shaven, with short dark hair slicked back, wearing a matte black tactical vest over a faded grey t-shirt, layered with a worn leather jacket, carrying a medical kit slung across his chest, the back of the jacket hangs plain

### `a tired schoolteacher, 40s, red hair`

- **81w → 73w**, negation gone, rear view kept, no trailing stop

> a tired schoolteacher, 40s, medium build, standing at 5'8", female, of mixed heritage, with a round face, pale skin, red hair tied back in a loose bun, clean-shaven, light brown eyes, faint lines around the mouth, wearing a faded navy blazer over a cream blouse, dark trousers, worn leather shoes, a single silver pendant on a chain around her neck, the back of the blazer hangs plain, hair tied tightly at the nape

### `a gunslinger, no weapons`

- **72w → 57w**, negation gone, rear view kept, no trailing stop

> a 32-year-old lean, wiry man, standing at 5'10", with a clean-shaven face and sharp jawline, wearing a faded brown leather jacket over a black t-shirt, his hair is short, dark, and slicked back, the jacket hangs loose at the back, the back of the coat, the fabric is worn but uncreased, the hands remain open and empty

Residual: input 4 leaves the stub `, the back of the coat,` where the verb sat inside the cut.
Positive-only and harmless to Krea2; not worth a bigger regex.

---

## Runner

Kept verbatim so the next revision is one command, not a rebuild.

```js
// MPI-504 enhancer regression, arm-based.
//   node enhancer-regression2.mjs <sysprompt file> <use_default_template true|false> <label>
import fs from 'node:fs';
import path from 'node:path';

const HOST = process.env.COMFY || 'http://127.0.0.1:8188';
const HERE = 'C:/Users/Fabio/AppData/Local/Temp/claude/c--AI-Mpi-Cubric-Vision/7a009b7a-7406-464b-874a-082fadc7cb2a/scratchpad';
const [spFile, udtArg, label] = process.argv.slice(2);
const SYSTEM = fs.readFileSync(path.join(HERE, spFile), 'utf8');
const UDT = udtArg === 'true';

const INPUTS = [
  'a 1870s Western Indian Chief',
  'a cyberpunk street medic',
  'a tired schoolteacher, 40s, red hair',
  'a gunslinger, no weapons',
];

const graph = (user, seed) => ({
  '69': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen3vl_4b_abliterated_fp8_scaled.safetensors', type: 'krea2', device: 'default' } },
  '420': { class_type: 'PrimitiveStringMultiline', inputs: { value: SYSTEM } },
  '112': { class_type: 'PrimitiveStringMultiline', inputs: { value: user } },
  '422': { class_type: 'StringConcatenate', inputs: { string_a: '\n', string_b: ['112', 0], delimiter: '' } },
  '418': { class_type: 'StringConcatenate', inputs: { string_a: ['420', 0], string_b: ['422', 0], delimiter: '' } },
  '419': { class_type: 'StringConcatenate', inputs: { string_a: ['418', 0], string_b: '\n<|im_end|>\n<|im_start|>assistant', delimiter: '' } },
  '58': { class_type: 'TextGenerate', inputs: {
    clip: ['69', 0], prompt: ['419', 0], max_length: 512, sampling_mode: 'on',
    'sampling_mode.temperature': 0.5, 'sampling_mode.top_k': 64, 'sampling_mode.top_p': 0.95,
    'sampling_mode.min_p': 0.05, 'sampling_mode.repetition_penalty': 1.05,
    'sampling_mode.seed': seed, 'sampling_mode.presence_penalty': 0,
    thinking: false, use_default_template: UDT } },
  '423': { class_type: 'StringReplace', inputs: { string: ['58', 0], find: '\n', replace: '' } },
  '242': { class_type: 'PreviewAny', inputs: { source: ['423', 0] } },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(user, seed) {
  const r = await fetch(HOST + '/prompt', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: graph(user, seed), client_id: 'mpi504-regression' }),
  });
  const j = await r.json();
  if (!j.prompt_id) throw new Error('queue failed: ' + JSON.stringify(j).slice(0, 900));
  for (let i = 0; i < 300; i++) {
    await sleep(1000);
    const h = await (await fetch(HOST + '/history/' + j.prompt_id)).json();
    const rec = h[j.prompt_id];
    if (!rec) continue;
    if (rec.status && rec.status.status_str === 'error') throw new Error(JSON.stringify(rec.status.messages).slice(0, 1500));
    if (rec.status && rec.status.completed) {
      const out = (rec.outputs || {})['242'];
      if (!out) return '';
      const v = out.text || out.string || out.value;
      return Array.isArray(v) ? String(v[0]) : JSON.stringify(out);
    }
  }
  throw new Error('timeout');
}

const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const HELD = /\b(hold(s|ing)?|held|carr(y|ies|ying)|grip(s|ping)?|clutch\w*|in (his|her|their|one) hand|in hand|wield\w*)\b/i;
const PLACE = /\b(background|backdrop|studio|desert|street|alley|classroom|sky|sunlight|sunlit|dust|dusty|neon|rain|lighting|shadow|lens|camera|\d+mm\b|shot|framing|photograph\w*|render\w*|grain|bokeh|cinematic|close-up)\b/i;
const BACK = /\b(back|behind|rear|slung|quiver\w*|spine|shoulder blades?|nape)\b/i;
const GEAR = /\b(belt|holster\w*|gunbelt|revolver|pistol|sidearm|knife|sheath\w*|quiver|pouch\w*|satchel|bandolier|rifle|blade|strap\w*|harness)\b/i;
const NEG = /\b(no|not|none|without|absent|devoid|lacking|bare of|free of)\b/i;
const LEAK = /plains chief|weathered plains/i;

const results = [];
for (const [i, input] of INPUTS.entries()) {
  process.stderr.write('\n--- [' + label + ' ' + (i + 1) + '/4] ' + input + '\n');
  let text = '';
  let err = null;
  try { text = await run(input, 0); } catch (e) { err = e.message; }
  const w = words(text);
  const t = text.trim();
  const checks = {
    a_lowercase_start: /^[a-z]/.test(t),
    a2_no_trailing_stop: t.length > 0 && !/\.$/.test(t),
    b_nothing_held: !HELD.test(text),
    c_no_place_light_camera: !PLACE.test(text),
    d_mentions_back: BACK.test(text),
    e_words_45_90: w >= 45 && w <= 90,
    f_gear: i === 3 ? (!GEAR.test(text) && !/no weapons?/i.test(text)) : GEAR.test(text),
    g_positive_only: !NEG.test(text),
    h_no_example_leak: i === 0 ? true : !LEAK.test(text),
  };
  results.push({ input, err, words: w, text, checks });
  console.log(JSON.stringify({ input, err, words: w, checks, text }, null, 1));
}
fs.writeFileSync(path.join(HERE, 'results-' + label + '.json'), JSON.stringify(results, null, 2), 'utf8');
console.log('\n=== SUMMARY [' + label + '] sysprompt=' + spFile + ' use_default_template=' + UDT + ' ===');
for (const r of results) {
  const fails = Object.entries(r.checks).filter(([, v]) => !v).map(([k]) => k);
  console.log((fails.length ? 'FAIL' : 'PASS') + '  ' + r.input + '  (' + r.words + 'w)' + (fails.length ? '  -> ' + fails.join(', ') : ''));
}
```
